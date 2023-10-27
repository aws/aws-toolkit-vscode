/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Maximum size limit (in bytes) that a project should be
export const projectSizeLimit = 25 * 1024 * 1024

// Max number of times a user can attempt to retry an approach request if it fails
export const approachRetryLimit = 3

// Max number of times a user can attempt to retry a codegen request if it fails
export const codeGenRetryLimit = 3

// The default retry limit used when the session could not be found
export const defaultRetryLimit = 0
