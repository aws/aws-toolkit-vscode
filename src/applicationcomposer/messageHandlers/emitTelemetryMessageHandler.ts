/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EmitTelemetryMessage } from '../types'
import {
    AppcomposerAddConnection,
    AppcomposerAddResource,
    AppcomposerCloseWfs,
    AppcomposerCustomerReady,
    AppcomposerFps,
    AppcomposerGenerateAccepted,
    AppcomposerGenerateClicked,
    AppcomposerGenerateRejected,
    AppcomposerInvalidGeneration,
    AppcomposerOpenWfs,
    AppcomposerPostProcess,
    AppcomposerRegenerateClicked,
    telemetry,
} from '../../shared/telemetry/telemetry'
import { getLogger } from '../../shared/logger'

export function emitTelemetryMessageHandler(message: EmitTelemetryMessage) {
    try {
        const parsedData = message.metadata ? JSON.parse(message.metadata) : {}
        switch (message.eventType) {
            case 'GENERATE_CLICKED':
                sendGenerateClicked(parsedData as AppcomposerGenerateClicked)
                return
            case 'REGENERATE_CLICKED':
                sendRegenerateClicked(parsedData as AppcomposerRegenerateClicked)
                return
            case 'GENERATE_ACCEPTED':
                sendGenerateAccepted(parsedData as AppcomposerGenerateAccepted)
                return
            case 'GENERATE_REJECTED':
                sendGenerateRejected(parsedData as AppcomposerGenerateRejected)
                return
            case 'INVALID_GENERATION':
                sendInvalidGeneration(parsedData as AppcomposerInvalidGeneration)
                return
            case 'POST_PROCESS':
                sendPostProcess(parsedData as AppcomposerPostProcess)
                return
            case 'CUSTOMER_READY':
                sendCustomerReady(parsedData as AppcomposerCustomerReady)
                return
            case 'FPS':
                sendFps(parsedData as AppcomposerFps)
                return
            case 'ADD_RESOURCE':
                sendAddResource(parsedData as AppcomposerAddResource)
                return
            case 'ADD_CONNECTION':
                sendAddConnection(parsedData as AppcomposerAddConnection)
                return
            case 'OPEN_WFS':
                sendOpenWfs(parsedData as AppcomposerOpenWfs)
                return
            case 'CLOSE_WFS':
                sendCloseWfs(parsedData as AppcomposerCloseWfs)
                return
        }
    } catch (e) {
        getLogger().error('Could not log telemetry for App Composer', e)
    }
}

function sendGenerateClicked(metadata: AppcomposerGenerateClicked) {
    telemetry.appcomposer_generateClicked.emit({
        result: metadata.result ?? 'Succeeded',
        resourceType: metadata.resourceType,
    })
}

function sendRegenerateClicked(metadata: AppcomposerRegenerateClicked) {
    telemetry.appcomposer_regenerateClicked.emit({
        result: metadata.result ?? 'Succeeded',
        resourceType: metadata.resourceType,
    })
}

function sendGenerateAccepted(metadata: AppcomposerGenerateAccepted) {
    telemetry.appcomposer_generateAccepted.emit({
        result: metadata.result ?? 'Succeeded',
        resourceType: metadata.resourceType,
        numAttempts: metadata.numAttempts,
    })
}

function sendGenerateRejected(metadata: AppcomposerGenerateRejected) {
    telemetry.appcomposer_generateRejected.emit({
        result: metadata.result ?? 'Succeeded',
        resourceType: metadata.resourceType,
        numAttempts: metadata.numAttempts,
    })
}

function sendInvalidGeneration(metadata: AppcomposerInvalidGeneration) {
    telemetry.appcomposer_invalidGeneration.emit({
        result: metadata.result ?? 'Succeeded',
        resourceType: metadata.resourceType,
        generateFailure: metadata.generateFailure,
    })
}

function sendPostProcess(metadata: AppcomposerPostProcess) {
    telemetry.appcomposer_postProcess.emit({
        result: metadata.result ?? 'Succeeded',
        resourceType: metadata.resourceType,
        pathsScrubbed: metadata.pathsScrubbed,
    })
}

function sendCustomerReady(metadata: AppcomposerCustomerReady) {
    telemetry.appcomposer_customerReady.emit({
        result: metadata.result ?? 'Succeeded',
        loadFileTime: metadata.loadFileTime,
        initializeTime: metadata.initializeTime,
        saveFileTime: metadata.saveFileTime,
    })
}

function sendFps(metadata: AppcomposerFps) {
    telemetry.appcomposer_fps.emit({
        result: metadata.result ?? 'Succeeded',
        fps: metadata.fps,
    })
}

function sendAddResource(metadata: AppcomposerAddResource) {
    telemetry.appcomposer_addResource.emit({
        result: metadata.result ?? 'Succeeded',
        resourceType: metadata.resourceType,
    })
}

function sendAddConnection(metadata: AppcomposerAddConnection) {
    telemetry.appcomposer_addConnection.emit({
        result: metadata.result ?? 'Succeeded',
        sourceResourceType: metadata.sourceResourceType,
        sourceFacetType: metadata.sourceFacetType,
        destResourceType: metadata.destResourceType,
        destFacetType: metadata.destFacetType,
    })
}

function sendOpenWfs(metadata: AppcomposerOpenWfs) {
    telemetry.appcomposer_openWfs.emit({
        result: metadata.result ?? 'Succeeded',
    })
}

function sendCloseWfs(metadata: AppcomposerCloseWfs) {
    telemetry.appcomposer_closeWfs.emit({
        result: metadata.result ?? 'Succeeded',
        didSave: metadata.didSave,
    })
}
