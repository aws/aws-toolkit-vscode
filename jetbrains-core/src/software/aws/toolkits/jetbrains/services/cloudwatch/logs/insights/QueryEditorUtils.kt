// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

/**
 * The default insights query string autofilled into the box. If this changes,
 * change the one in InsightsQueryTest as well
 */
const val DEFAULT_INSIGHTS_QUERY_STRING =
"""fields @timestamp, @message
| sort @timestamp desc
| limit 20
"""
