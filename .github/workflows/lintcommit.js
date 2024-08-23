// Checks that a PR title conforms to our custom flavor of "conventional commits"
// (https://www.conventionalcommits.org/).
//
// To run self-tests, simply run this script:
//
//     node lintcommit.js test
//
// TODO: "PR must describe Problem in a concise way, and Solution".
// TODO: this script intentionally avoids github APIs so that it is locally-debuggable, but if those
// are needed, use actions/github-script as described in: https://github.com/actions/github-script?tab=readme-ov-file#run-a-separate-file
//

const fs = require('fs')
// This script intentionally avoids github APIs so that:
//   1. it is locally-debuggable
//   2. the CI job is fast ("npm install" is slow)
// But if we still want to use github API, we can keep it fast by using `actions/github-script` as
// described in: https://github.com/actions/github-script?tab=readme-ov-file#run-a-separate-file
//
// const core = require('@actions/core')
// const github = require('@actions/github')

const types = new Set([
    'build',
    // Don't allow "chore" because it's over-used.
    // Instead, add a new type if absolutely needed (if the existing ones can't possibly apply).
    // 'chore',
    'ci',
    'config',
    'deps',
    'docs',
    'feat',
    'fix',
    'perf',
    'refactor',
    'revert',
    'style',
    'telemetry',
    'test',
    'types',
])

// TODO: Validate against this once we are satisfied with this list.
const scopes = new Set([
    'amazonq',
    'core',
    'explorer',
    'lambda',
    'logs',
    'redshift',
    'q-chat',
    'q-featuredev',
    'q-inlinechat',
    'q-transform',
    'sam',
    's3',
    'telemetry',
    'toolkit',
    'ui',
])
void scopes

/**
 * Checks that a pull request title, or commit message subject, follows the expected format:
 *
 *      type(scope): message
 *
 * Returns undefined if `title` is valid, else an error message.
 */
function validateTitle(title) {
    const parts = title.split(':')
    const subject = parts.slice(1).join(':').trim()

    if (title.startsWith('Merge')) {
        return undefined
    }

    if (parts.length < 2) {
        return 'missing colon (:) char'
    }

    const typeScope = parts[0]

    const [type, scope] = typeScope.split(/\(([^)]+)\)$/)

    if (/\s+/.test(type)) {
        return `type contains whitespace: "${type}"`
    } else if (type === 'chore') {
        return 'Do not use "chore" as a type. If the existing valid types are insufficent, add a new type to the `lintcommit.js` script.'
    } else if (!types.has(type)) {
        return `invalid type "${type}"`
    } else if (!scope && typeScope.includes('(')) {
        return `must be formatted like type(scope):`
    } else if (!scope && ['feat', 'fix'].includes(type)) {
        return `"${type}" type must include a scope (example: "${type}(amazonq)")`
    } else if (scope && scope.length > 30) {
        return 'invalid scope (must be <=30 chars)'
    } else if (scope && /[^- a-z0-9]+/.test(scope)) {
        return `invalid scope (must be lowercase, ascii only): "${scope}"`
    } else if (subject.length === 0) {
        return 'empty subject'
    } else if (subject.length > 100) {
        return 'invalid subject (must be <=100 chars)'
    }

    return undefined
}

function run() {
    const eventData = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    const pullRequest = eventData.pull_request

    // console.log(eventData)

    if (!pullRequest) {
        console.info('No pull request found in the context')
        return
    }

    const title = pullRequest.title

    const failReason = validateTitle(title)
    const msg = failReason
        ? `
Invalid pull request title: \`${title}\`

* Problem: ${failReason}
* Expected format: \`type(scope): subject...\`
    * type: one of (${Array.from(types).join(', ')})
    * scope: lowercase, <30 chars
    * subject: must be <100 chars
    * documentation: https://github.com/aws/aws-toolkit-vscode/blob/master/CONTRIBUTING.md#pull-request-title
`
        : `Pull request title matches the [expected format](https://github.com/aws/aws-toolkit-vscode/blob/master/CONTRIBUTING.md#pull-request-title).`

    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, msg)
    }

    if (failReason) {
        console.error(msg)
        process.exit(1)
    } else {
        console.info(msg)
    }
}

function _test() {
    const tests = {
        ' foo(scope): bar': 'type contains whitespace: " foo"',
        'build: update build process': undefined,
        'chore: update dependencies':
            'Do not use "chore" as a type. If the existing valid types are insufficent, add a new type to the `lintcommit.js` script.',
        'ci: configure CI/CD': undefined,
        'config: update configuration files': undefined,
        'deps: bump the aws-sdk group across 1 directory with 5 updates': undefined,
        'docs: update documentation': undefined,
        'feat(foo): add new feature': undefined,
        'feat(foo):': 'empty subject',
        'feat foo):': 'type contains whitespace: "feat foo)"',
        'feat(foo)): sujet': 'invalid type "feat(foo))"',
        'feat(foo: sujet': 'invalid type "feat(foo"',
        'feat(Q Foo Bar): bar': 'invalid scope (must be lowercase, ascii only): "Q Foo Bar"',
        'feat(scope):': 'empty subject',
        'feat(q foo bar): bar': undefined,
        'feat(foo): x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x x ':
            'invalid subject (must be <=100 chars)',
        'feat: foo': '"feat" type must include a scope (example: "feat(amazonq)")',
        'fix: foo': '"fix" type must include a scope (example: "fix(amazonq)")',
        'fix(a-b-c): resolve issue': undefined,
        'foo (scope): bar': 'type contains whitespace: "foo "',
        'invalid title': 'missing colon (:) char',
        'perf: optimize performance': undefined,
        'refactor: improve code structure': undefined,
        'revert: feat: add new feature': undefined,
        'style: format code': undefined,
        'test: add new tests': undefined,
        'types: add type definitions': undefined,
        'Merge staging into feature/lambda-get-started': undefined,
    }

    let passed = 0
    let failed = 0

    for (const [title, expected] of Object.entries(tests)) {
        const result = validateTitle(title)
        if (result === expected) {
            console.log(`✅ Test passed for "${title}"`)
            passed++
        } else {
            console.log(`❌ Test failed for "${title}" (expected "${expected}", got "${result}")`)
            failed++
        }
    }

    console.log(`\n${passed} tests passed, ${failed} tests failed`)
}

function main() {
    const mode = process.argv[2]

    if (mode === 'test') {
        _test()
    } else {
        run()
    }
}

main()
