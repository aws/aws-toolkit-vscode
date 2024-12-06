// Check that branch name conforms to GitHub naming convention:
// https://docs.github.com/en/get-started/using-git/dealing-with-special-characters-in-branch-and-tag-names#naming-branches-and-tags

// To run self-tests,
// node lintbranch.js test
// TODO: deduplicate code from lintbranch.js and lintcommit.js.

function isValid(branchName) {
    const branchNameRegex = /^[a-zA-Z][a-zA-Z0-9._/-]*$/

    return branchNameRegex.test(branchName)
}

function run(branchName) {
    if (isValid(branchName)) {
        console.log(`Branch name "${branchName}" is valid.`)
        process.exit(0)
    } else {
        const helpUrl =
            'https://docs.github.com/en/get-started/using-git/dealing-with-special-characters-in-branch-and-tag-names#naming-branches-and-tags'
        console.log(`Branch name "${branchName}" is invalid see ${helpUrl} for more information.`)
        process.exit(1)
    }
}

function _test() {
    const tests = {
        'feature/branch-name': true,
        feature_123: true,
        'my-branch': true,
        '123invalid-start': false,
        '!invalid@start': false,
        '': false,
        'another/valid-name134': true,
        'feature/123";id;{echo,Y2F0IC9ldGMvcGFzc3dk}|{base64,-d}|{bash,-i};#': false,
    }

    let passed = 0
    let failed = 0

    for (const [branchName, expected] of Object.entries(tests)) {
        const result = isValid(branchName)
        if (result === expected) {
            console.log(`✅ Test passed for "${branchName}"`)
            passed++
        } else {
            console.log(`❌ Test failed for "${branchName}" (expected "${expected}", got "${result}")`)
            failed++
        }
    }

    console.log(`\n${passed} tests passed, ${failed} tests failed`)
}

function main() {
    const mode = process.argv[2]

    if (mode === 'test') {
        _test()
    } else if (mode === 'run') {
        run(process.argv[3])
    } else {
        throw new Error(`Unknown mode: ${mode}`)
    }
}

main()
