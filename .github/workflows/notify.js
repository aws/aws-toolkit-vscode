/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const { hasPath, dedupComment } = require('./utils')

const testFilesMessage =
    '- This pull request modifies code in `src/*` but no tests were added/updated.\n    - Confirm whether tests should be added or ensure the PR description explains why tests are not required.\n'

const changelogMessage =
    '- This pull request implements a `feat` or `fix`, so it must include a changelog entry (unless the fix is for an *unreleased* feature). Review the [changelog guidelines](https://github.com/aws/aws-toolkit-vscode/blob/master/CONTRIBUTING.md#changelog).\n    - Note: beta or "experiment" features that have active users *should* announce fixes in the changelog.\n    - If this is not a feature or fix, use an appropriate type from the [title guidelines](https://github.com/aws/aws-toolkit-vscode/blob/master/CONTRIBUTING.md#pull-request-title). For example, telemetry-only changes should use the `telemetry` type.\n'

/**
 * Remind partner teams that tests are required. We don't need to remind them if:
 *  1. They did not change anything in a src directory
 *  2. They already have test files in the PR
 *  3. We've already told them in a previous PR comment
 */
module.exports = async ({ github, context }) => {
    const owner = context.repo.owner
    const repo = context.repo.repo
    const author = context.payload.pull_request.head.repo.owner.login
    const pullRequestId = context.payload.pull_request.number

    const response = await github.rest.repos.compareCommitsWithBasehead({
        owner,
        repo,
        basehead: `${owner}:${context.payload.pull_request.base.ref}...${author}:${context.payload.pull_request.head.ref}`,
    })

    const filenames = response.data.files.map((file) => file.filename)

    const shouldAddTestFileMessage = requiresTestFilesMessage(filenames)
    const shouldAddChangelogMessage = requiresChangelogMessage(filenames, context.payload.pull_request.title)

    if (!shouldAddTestFileMessage && !shouldAddChangelogMessage) {
        return
    }

    // Check for prior comments on the PR
    const comments = await github.rest.issues.listComments({
        owner,
        repo,
        issue_number: pullRequestId,
    })

    let msg = ''
    if (shouldAddTestFileMessage) {
        msg += testFilesMessage
    }
    if (shouldAddChangelogMessage) {
        msg += changelogMessage
    }

    if (shouldAddTestFileMessage || shouldAddChangelogMessage) {
        await dedupComment({ github, comments, owner, repo, pullRequestId, message: msg })
    }
}

/**
 * Require the changelog message if the scope is fix/feat AND there is no changelog item
 */
function requiresChangelogMessage(filenames, title) {
    try {
        return !hasPath(filenames, '.changes') && (title.startsWith('fix') || title.startsWith('feat'))
    } catch (e) {
        console.log(e)
        return undefined
    }
}

/**
 * Require the test files message if there are changes to source files but aren't any
 * changes to the test files
 */
function requiresTestFilesMessage(filenames, title) {
    if (/^\s*[mM]erge/.test(title)) {
        console.log('"Merge" pull request')
        return
    }

    // Check if src directory changed
    if (!hasPath(filenames, 'src/')) {
        console.log('Did not find src files in the code changes')
        return
    }

    // Check if test files were added or modified
    if (hasPath(filenames, '.test.ts')) {
        console.log('Found test files in the code changes')
        return
    }

    return true
}
