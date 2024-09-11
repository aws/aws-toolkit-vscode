/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
    dedupComment,
    hasPath,
}
