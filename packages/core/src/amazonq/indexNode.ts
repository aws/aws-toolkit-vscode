/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * These agents have underlying requirements on node dependencies (e.g. jsdom, admzip)
 */
export { init as cwChatAppInit } from '../codewhispererChat/app'
export { init as featureDevChatAppInit } from '../amazonqFeatureDev/app' // TODO: Remove this
export { init as gumbyChatAppInit } from '../amazonqGumby/app'
export { init as docChatAppInit } from '../amazonqDoc/app' // TODO: Remove this
