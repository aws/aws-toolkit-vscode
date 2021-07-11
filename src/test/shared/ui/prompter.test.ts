/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Prompter, PromptResult } from '../../../shared/ui/prompter'

export class SimplePrompter<T> extends Prompter<T> {
    constructor(private readonly input: T | PromptResult<T>) {
        super()
    }
    protected async promptUser(): Promise<PromptResult<T>> {
        return this.input
    }
    public setSteps(current: number, total: number): void {}
    public set lastResponse(response: any) {}
    public get lastResponse(): any {
        return undefined
    }
}

describe('Prompter', function () {
    it('returns a value', async function () {
        const prompter = new SimplePrompter(1)
        assert.strictEqual(await prompter.prompt(), 1)
    })

    it('can map one type to another', async function () {
        const prompter = new SimplePrompter(1).transform(resp => resp.toString())
        assert.strictEqual(await prompter.prompt(), '1')
    })

    it('throws error if calling prompt multiple times', async function () {
        const prompter = new SimplePrompter(1)
        await prompter.prompt()
        await assert.rejects(prompter.prompt())
    })

    it('can attach multiple callbacks', async function () {
        const prompter = new SimplePrompter(1)
        prompter.after(resp => resp * 2)
        prompter.after(resp => resp + 2)
        prompter.after(resp => resp * 2)
        prompter.after(resp => resp - 2)
        prompter.transform(resp => resp.toString()).after(resp => `result: ${resp}`)
        assert.strictEqual(await prompter.prompt(), 'result: 6')
    })
})
