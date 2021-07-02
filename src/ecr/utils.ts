/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { localize } from '../shared/utilities/vsCodeUtils'

/**
 * Validates an ECR repository name. There are actually more rules, but they aren't documented, so
 * let the service fail the creation if one of the more complicated rules is violated
 *
 * @see https://docs.aws.amazon.com/AmazonECR/latest/APIReference/API_Repository.html
 * @returns undefined if the name passes validation. Otherwise, a localized error message is returned.
 */
export function validateRepositoryName(name: string): string | undefined {
    if (!/^[a-z]/.test(name)) {
        return localize(
            'AWS.ecr.validateRepoName.error.invalidStart',
            'Repository name must start with a lowercase letter'
        )
    }

    if (!/^[a-z0-9\-_/]+$/.test(name)) {
        return localize(
            'AWS.ecr.validateRepoName.error.invalidCharacters',
            'Repository name must only contain lowercase letters, numbers, hyphens, underscores, and forward slashes'
        )
    }

    // See the APIReference document above for the source of this. ^ and $ added to make sure
    // it matches the whole string
    if (!/^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*\/)*[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(name)) {
        return localize('AWS.ecr.validateRepoName.error.invalidString', 'Invalid repository name')
    }

    return undefined
}
