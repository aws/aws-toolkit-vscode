/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    CodewhispererCompletionType,
    CodewhispererLanguage,
    CodewhispererGettingStartedTask,
} from '../../shared/telemetry/telemetry.gen'
import { GenerateRecommendationsRequest, ListRecommendationsRequest } from '../client/codewhisperer'
import { Position } from 'vscode'
import {
    CodeWhispererSupplementalContext,
    fetchSupplementalContext,
} from './supplementalContext/supplementalContextUtil'
import { CWFileContext, CWRecommendationEntry } from '../models/model'
import {
    buildGenerateRecommendationRequest,
    buildListRecommendationRequest,
    extractContextForCodeWhisperer,
} from './editorContext'
import { supplementalContextTimeoutInMs } from '../models/constants'

const performance = globalThis.performance ?? require('perf_hooks').performance

class CodeWhispererSession {
    static #instance: CodeWhispererSession

    // Some other variables for client component latency
    fetchCredentialStartTime = 0
    sdkApiCallStartTime = 0
    invokeSuggestionStartTime = 0

    public static get instance() {
        return (this.#instance ??= new CodeWhispererSession())
    }

    setFetchCredentialStart() {
        if (this.fetchCredentialStartTime === 0 && this.invokeSuggestionStartTime !== 0) {
            this.fetchCredentialStartTime = performance.now()
        }
    }

    setSdkApiCallStart() {
        if (this.sdkApiCallStartTime === 0 && this.fetchCredentialStartTime !== 0) {
            this.sdkApiCallStartTime = performance.now()
        }
    }
}

// TODO: convert this to a function call
export const componentLatencyTimer = CodeWhispererSession.instance
