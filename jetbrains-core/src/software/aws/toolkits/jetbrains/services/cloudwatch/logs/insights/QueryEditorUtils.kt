// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

const val DEFAULT_INSIGHTS_QUERY_STRING =
"""fields @timestamp, @message
| sort @timestamp desc
| limit 20
"""
