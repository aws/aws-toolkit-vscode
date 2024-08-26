/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const needsTestFiles =
    'This pull request modifies files in src/ but no tests were added/updated. Confirm whether tests should be added or ensure the PR description explains why tests are not required.'

/**
 * Remind partner teams that tests are required. We don't need to remind them if:
 *  1. They did not change anything in a src directory
 *  2. They already have test files in the PR
 *  3. We've already told them in a previous PR comment
 * fooo
 */
module.exports = async ({ github, context }) => {
    const owner = context.repo.owner
    const repo = context.repo.repo

    const response = await github.rest.repos.compareCommitsWithBasehead({
        owner,
        repo,
        basehead: `${context.payload.pull_request.base.ref}...${context.payload.pull_request.head.ref}`,
    })

    const filenames = response.data.files.map((file) => file.filename)

    // Check if src directory changed
    const srcFiles = filenames.filter((file) => file.includes('src/'))
    if (srcFiles.length === 0) {
        console.log('Did not find src files in the code changes')
        return
    }

    // Check if test files were added or modified
    const testFiles = filenames.filter((file) => file.endsWith('.test.ts'))
    if (testFiles.length > 0) {
        console.log('Found test files in the code changes')
        return
    }

    // Check for prior comments on the PR
    const comments = await github.rest.issues.listComments({
        owner,
        repo,
        issue_number: context.payload.pull_request.number,
    })

    if (comments.data.some((comment) => comment.body.includes(needsTestFiles))) {
        console.log('Found prior comment indicating tests are needed')
        return
    }

    await github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner,
        repo,
        body: needsTestFiles,
    })
}
