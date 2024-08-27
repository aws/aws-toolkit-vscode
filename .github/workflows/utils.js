/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

function parsePRTitle(title) {
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
    return {
        type,
        scope,
        subject,
    }
}

/**
 * Create a comment on a PR if one does not already exist
 */
async function dedupComment({ github, pullRequestId, owner, repo, comments, message }) {
    if (comments.data.some((comment) => comment.body.includes(message))) {
        return
    }

    await github.rest.issues.createComment({
        issue_number: pullRequestId,
        owner,
        repo,
        body: message,
    })
}

/*
 * Check if path is included in at least one of the filename paths
 */
function hasPath(filenames, path) {
    return filenames.some((file) => file.includes(path))
}

module.exports = {
    parsePRTitle,
    dedupComment,
    hasPath,
}
