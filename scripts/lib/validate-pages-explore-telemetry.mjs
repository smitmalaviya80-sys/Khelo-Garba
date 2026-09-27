import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..')
const SOURCE_ADAPTER = path.join(REPO_ROOT, 'src/catalogue/explore-telemetry.js')
const SOURCE_TELEMETRY_ROOT = path.join(REPO_ROOT, 'src/pga/telemetry')
const ROUTES = ['catalogue', 'explore']

function fail(message) {
  throw new Error(`[pages-explore-telemetry] ${message}`)
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function assertRegularFile(filePath, label) {
  let stat
  try {
    stat = fs.lstatSync(filePath)
  } catch {
    fail(`${label} is missing: ${path.relative(REPO_ROOT, filePath) || filePath}`)
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular file: ${filePath}`)
}

function moduleSpecifiers(source) {
  const specifiers = new Set()
  const patterns = [
    /\b(?:import|export)\s+[\s\S]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1])
  }
  return [...specifiers]
}

function cleanSpecifier(specifier) {
  const marker = specifier.search(/[?#]/)
  return marker === -1 ? specifier : specifier.slice(0, marker)
}

function resolveLocalModule(fromFile, specifier, root, label) {
  if (!specifier.startsWith('.')) {
    fail(`${label} uses a non-local module specifier (${specifier}) in ${fromFile}`)
  }
  const cleaned = cleanSpecifier(specifier)
  if (!cleaned.endsWith('.js')) fail(`${label} module import must name a .js file: ${specifier}`)
  const target = path.resolve(path.dirname(fromFile), cleaned)
  if (!isWithin(root, target)) fail(`${label} module import escapes its allowed root: ${specifier}`)
  assertRegularFile(target, `${label} dependency`)
  return target
}

function sourceGraph() {
  assertRegularFile(SOURCE_ADAPTER, 'Explore telemetry adapter')
  assertRegularFile(path.join(SOURCE_TELEMETRY_ROOT, 'index.js'), 'PGA telemetry entrypoint')

  const graph = new Set([SOURCE_ADAPTER])
  const pending = [SOURCE_ADAPTER]

  while (pending.length) {
    const current = pending.pop()
    const source = fs.readFileSync(current, 'utf8')
    for (const specifier of moduleSpecifiers(source)) {
      const target = path.resolve(path.dirname(current), cleanSpecifier(specifier))
      const allowed = target === SOURCE_ADAPTER || isWithin(SOURCE_TELEMETRY_ROOT, target)
      if (!allowed) fail(`source dependency escapes the approved Explore/PGA telemetry tree: ${specifier}`)
      if (target !== SOURCE_ADAPTER && target.split(path.sep).includes('tests')) {
        fail(`production telemetry graph must not import test code: ${specifier}`)
      }
      const resolved = resolveLocalModule(current, specifier, target === SOURCE_ADAPTER ? path.dirname(SOURCE_ADAPTER) : SOURCE_TELEMETRY_ROOT, 'source')
      if (!graph.has(resolved)) {
        graph.add(resolved)
        pending.push(resolved)
      }
    }
  }

  return graph
}

function destinationForSource(sourceFile, artifactRoot) {
  if (sourceFile === SOURCE_ADAPTER) return null
  if (!isWithin(SOURCE_TELEMETRY_ROOT, sourceFile)) fail(`unexpected source module: ${sourceFile}`)
  return path.join(artifactRoot, 'pga/telemetry', path.relative(SOURCE_TELEMETRY_ROOT, sourceFile))
}

function publishGraph(artifactRoot) {
  const root = path.resolve(artifactRoot)
  const graph = sourceGraph()

  for (const route of ROUTES) {
    const routeDir = path.join(root, route)
    fs.mkdirSync(routeDir, { recursive: true })
    assertRegularFile(path.join(routeDir, 'index.html'), `${route} index`)
    fs.copyFileSync(SOURCE_ADAPTER, path.join(routeDir, 'explore-telemetry.js'))
  }

  for (const sourceFile of graph) {
    if (sourceFile === SOURCE_ADAPTER) continue
    const destination = destinationForSource(sourceFile, root)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(sourceFile, destination)
  }

  return validateArtifact(root)
}

function assertRouteLoadsAdapter(root, route) {
  const htmlPath = path.join(root, route, 'index.html')
  assertRegularFile(htmlPath, `${route} index`)
  const html = fs.readFileSync(htmlPath, 'utf8')
  if (!/import\s*\(\s*['"]\.\/explore-telemetry\.js['"]\s*\)/.test(html)) {
    fail(`${route}/index.html does not resolve the local Explore telemetry adapter`)
  }
  const adapter = path.join(root, route, 'explore-telemetry.js')
  assertRegularFile(adapter, `${route} Explore telemetry adapter`)
  return adapter
}

function validateArtifact(artifactRoot) {
  const root = path.resolve(artifactRoot)
  const telemetryRoot = path.join(root, 'pga/telemetry')
  const pending = ROUTES.map((route) => assertRouteLoadsAdapter(root, route))
  const visited = new Set()

  while (pending.length) {
    const current = pending.pop()
    if (visited.has(current)) continue
    if (!isWithin(root, current)) fail(`deployed module escaped the Pages artifact: ${current}`)
    assertRegularFile(current, 'deployed telemetry module')
    visited.add(current)

    const source = fs.readFileSync(current, 'utf8')
    for (const specifier of moduleSpecifiers(source)) {
      const target = path.resolve(path.dirname(current), cleanSpecifier(specifier))
      const allowed = ROUTES.some((route) => target === path.join(root, route, 'explore-telemetry.js'))
        || isWithin(telemetryRoot, target)
      if (!allowed) fail(`deployed telemetry import escapes the approved artifact graph: ${specifier}`)
      const dependencyRoot = isWithin(telemetryRoot, target) ? telemetryRoot : root
      const resolved = resolveLocalModule(current, specifier, dependencyRoot, 'deployed')
      if (!visited.has(resolved)) pending.push(resolved)
    }
  }

  const deployedTelemetry = fs.existsSync(telemetryRoot)
    ? fs.readdirSync(telemetryRoot, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath || entry.path, entry.name))
    : []

  for (const filePath of deployedTelemetry) {
    if (!filePath.endsWith('.js')) fail(`non-JavaScript file leaked into public telemetry artifact: ${filePath}`)
    if (!visited.has(filePath)) fail(`unreachable telemetry module was copied into public artifact: ${filePath}`)
  }

  const telemetryModules = [...visited].filter((filePath) => isWithin(telemetryRoot, filePath))
  if (telemetryModules.length === 0) fail('no PGA telemetry modules were reachable from Explore')

  return { routes: ROUTES.length, modules: visited.size, telemetryModules: telemetryModules.length }
}

function selfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playgarba-pages-telemetry-'))
  try {
    for (const route of ROUTES) {
      const routeDir = path.join(tempRoot, route)
      fs.mkdirSync(routeDir, { recursive: true })
      fs.copyFileSync(path.join(REPO_ROOT, 'src/catalogue/index.html'), path.join(routeDir, 'index.html'))
    }

    const result = publishGraph(tempRoot)
    const sourceModules = [...sourceGraph()].filter((filePath) => filePath !== SOURCE_ADAPTER)
    const victimSource = sourceModules.find((filePath) => path.basename(filePath) === 'transport.js') || sourceModules[0]
    if (!victimSource) fail('self-test could not identify a transitive telemetry dependency')
    fs.unlinkSync(destinationForSource(victimSource, tempRoot))

    let rejectedMissingDependency = false
    try {
      validateArtifact(tempRoot)
    } catch {
      rejectedMissingDependency = true
    }
    if (!rejectedMissingDependency) fail('self-test accepted an artifact with a missing transitive dependency')

    console.log(`Pages Explore telemetry self-test passed (${result.routes} routes, ${result.telemetryModules} shared modules).`)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

const [mode = '--validate', rootArg = '_site'] = process.argv.slice(2)

if (mode === '--self-test') {
  selfTest()
} else if (mode === '--publish-and-validate') {
  const result = publishGraph(rootArg)
  console.log(`Pages Explore telemetry graph published and validated (${result.routes} routes, ${result.telemetryModules} shared modules).`)
} else if (mode === '--validate') {
  const result = validateArtifact(rootArg)
  console.log(`Pages Explore telemetry artifact validated (${result.routes} routes, ${result.telemetryModules} shared modules).`)
} else {
  fail(`unknown mode: ${mode}`)
}
