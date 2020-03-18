/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Comment, Sentiment } from './clienttelemetry'

export interface TelemetryFeedback {
    sentiment: Sentiment
    comment: Comment
}
