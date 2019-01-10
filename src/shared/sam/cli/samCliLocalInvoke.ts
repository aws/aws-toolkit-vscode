/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { fileExists } from '../../filesystemUtilities'
import { SamCliInvocation } from './samCliInvocation'
import { DefaultSamCliInvoker, SamCliInvoker } from './samCliInvoker'

export interface SamCliLocalInvokeResponse {
}

export class SamCliLocalInvokeInvocation extends SamCliInvocation<SamCliLocalInvokeResponse> {

    public constructor(
        private readonly templateResourceName: string,
        private readonly templatePath: string,
        private readonly eventPath: string,
        private readonly debugPort?: string,
        invoker: SamCliInvoker = new DefaultSamCliInvoker()
    ) {
        super(invoker)
    }

    public async execute(): Promise<SamCliLocalInvokeResponse> {
        await this.validate()

        await this.invoker.localInvoke(
            this.templateResourceName,
            this.templatePath,
            this.eventPath,
            this.debugPort
        )

        return {}
    }

    protected async validate(): Promise<void> {
        if (!this.templateResourceName) {
            throw new Error('template resource name is missing or empty')
        }

        if (!await fileExists(this.templatePath)) {
            throw new Error(`template path does not exist: ${this.templatePath}`)
        }

        if (!await fileExists(this.eventPath)) {
            throw new Error(`event path does not exist: ${this.eventPath}`)
        }
    }
}
