/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const { hasPath, dedupComment } = require('./utils')

const testFilesMessage =
    'This pull request modifies files in src/ but no tests were added/updated. Confirm whether tests should be added or ensure the PR description explains why tests are not required.'

const changelogMessage =
    'This pull request modifies a feature or fixes a bug, but it does not include a changelog entry. All pull requests that introduce new features or bug fixes must have a corresponding changelog item describing the changes.'

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

    if (shouldAddTestFileMessage) {
        await dedupComment({ github, comments, owner, repo, pullRequestId, message: testFilesMessage })
    }

    if (shouldAddChangelogMessage) {
        await dedupComment({ github, comments, owner, repo, pullRequestId, message: changelogMessage })
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
function requiresTestFilesMessage(filenames) {
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
