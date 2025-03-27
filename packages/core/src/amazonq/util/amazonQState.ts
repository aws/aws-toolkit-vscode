/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Manages the state of Amazon Q service in the extension
 * using Singleton pattern.
 */
export class AmazonQState {
    private static _instance: AmazonQState | undefined
    private readonly _serviceName: string

    private constructor(serviceName: string) {
        this._serviceName = serviceName
    }

    public static initialize(serviceName: string): AmazonQState {
        if (!this._instance) {
            this._instance = new AmazonQState(serviceName)
        }
        return this._instance
    }

    public static get instance(): AmazonQState {
        if (!this._instance) {
            throw new Error('AmazonQState not initialized. Call initialize() first')
        }
        return this._instance
    }

    public get serviceName(): string {
        return this._serviceName
    }

    public isSageMakerUnifiedStudio(): boolean {
        return this._serviceName === 'SageMakerUnifiedStudio'
    }
}
