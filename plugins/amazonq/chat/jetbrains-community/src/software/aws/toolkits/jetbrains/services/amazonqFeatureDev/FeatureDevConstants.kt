// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev

const val FEATURE_NAME = "Amazon Q Developer Agent for software development"

// Max number of times a user can attempt to retry an approach request if it fails
const val APPROACH_RETRY_LIMIT = 3

// Max number of times a user can attempt to retry a codegeneration request if it fails
const val CODE_GENERATION_RETRY_LIMIT = 3

// The default retry limit used when the session could not be found
const val DEFAULT_RETRY_LIMIT = 0
