/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { parse } from '@aws-sdk/util-arn-parser'
import { Lambda, STS } from 'aws-sdk'
import * as vscode from 'vscode'
import { getLogger } from '../shared/logger'
import { hasKey } from '../shared/utilities/tsUtils'
import { getTestWindow, printPendingUiElements } from './shared/vscode/window'
import { ToolkitError, formatError } from '../shared/errors'
import { proceedToBrowser } from '../auth/sso/model'

const runnableTimeout = Symbol('runnableTimeout')

/**
 * Wraps the test function to bubble up errors that occurred in events from `TestWindow`
 */
export function setRunnableTimeout(test: Mocha.Runnable, maxTestDuration: number): Mocha.Runnable {
    const testFn = test.fn
    if (!testFn) {
        return test
    }

    // The timeout duration is stored within the function itself, allowing
    // us to know if we've already added a timeout
    if (!hasKey(testFn, runnableTimeout)) {
        const fn = function (this: Mocha.Context, done: Mocha.Done) {
            const maxTestDuration = (fn as any)[runnableTimeout] as number

            return Promise.race([
                testFn.call(this, done),
                new Promise<void>((_, reject) => {
                    getTestWindow().onError(({ event, error }) => {
                        event.dispose()
                        reject(error)
                    })

                    // Set a hard time limit per-test so CI doesn't hang
                    // Mocha's `timeout` method isn't used because we want to emit a custom message
                    setTimeout(() => {
                        const duration = `${maxTestDuration / 1000} seconds`
                        const message = `Test length exceeded max duration: ${duration}\n${printPendingUiElements()}`
                        reject(new Error(message))
                    }, maxTestDuration)
                }),
            ])
        }

        test.fn = fn
    }

    Object.assign(test.fn!, { [runnableTimeout]: maxTestDuration })

    return test
}

export function skipTest(testOrCtx: Mocha.Context | Mocha.Test | undefined, reason?: string) {
    let test

    if (testOrCtx?.type === 'test') {
        test = testOrCtx as Mocha.Test
    } else {
        const context = testOrCtx as Mocha.Context | undefined
        test = context?.currentTest ?? context?.test
    }

    if (test) {
        test.title += ` (skipped${reason ? ` - ${reason}` : ''})`
        test.skip()
    }
}

export function skipSuite(suite: Mocha.Suite, reason?: string) {
    suite.eachTest(test => skipTest(test, reason))
}

export function mapTestErrors(runner: Mocha.Runner, fn: (err: unknown, test: Mocha.Test) => any) {
    return runner.prependListener('fail', (test, err) => {
        test.err = fn(err, test) || err
    })
}

/**
 * Formats any known sub-classes of {@link Error} for better compatability with test reporters.
 *
 * Most test reporters will only output the name + message + stack trace so any relevant
 * info must go into those fields.
 */
export function normalizeError(err?: unknown) {
    if (err instanceof ToolkitError) {
        // Error has to be mutated to show up in the report:
        // https://github.com/michaelleeallen/mocha-junit-reporter/blob/4b17772f8da33d580fafa4d124e5c11142a70c1f/index.js#L262
        //
        // We'll just patch the message/stack trace even though it's arguably incorrect (and looks kind of ugly)
        // Once `cause` is more common in the JS ecosystem we'll start to see support from test reporters

        return Object.assign(err, {
            message: formatError(err).replace(`${err.name}: `, ''),
            stack: err.stack?.replace(err.message, err.trace.replace(`${err.name}: `, '') + '\n'),
        })
    }

    return err
}

export function patchObject<T extends Record<string, any>, U extends keyof T>(
    obj: T,
    key: U,
    value: T[U]
): vscode.Disposable {
    return patchObjectDescriptor(obj, key, { value })
}

export function patchObjectDescriptor<T extends Record<string, any>, U extends keyof T>(
    obj: T,
    key: U,
    descriptor: TypedPropertyDescriptor<T[U]>
): vscode.Disposable {
    const original = Object.getOwnPropertyDescriptor(obj, key)
    Object.defineProperty(obj, key, descriptor)

    function dispose() {
        if (original === undefined) {
            delete obj[key]
        } else {
            Object.defineProperty(obj, key, original)
        }
    }

    return { dispose }
}

async function createLambdaClient(functionId: string) {
    if (!functionId.startsWith('arn:aws:lambda')) {
        return Object.assign(new Lambda(), { isCrossAccount: false })
    }

    const sts = new STS()
    const { region, accountId } = parse(functionId)
    const identity = await sts.getCallerIdentity().promise()
    const client = new Lambda({ region })

    return Object.assign(client, { isCrossAccount: identity.Account !== accountId })
}

export async function invokeLambda(id: string, request: unknown): Promise<unknown> {
    const client = await createLambdaClient(id)
    const response = await client
        .invoke({
            FunctionName: id,
            // Setting this to `Tail` with cross account calls results in
            // `AccessDeniedException: Cross-account log access is not allowed`
            LogType: client.isCrossAccount ? 'None' : 'Tail',
            Payload: JSON.stringify(request),
        })
        .promise()
        .catch(err => {
            if (err instanceof Error) {
                err.message = maskArns(err.message)
            }
            throw err
        })

    if (response.LogResult) {
        const logs = Buffer.from(response.LogResult, 'base64').toString()
        getLogger().debug('lambda invocation logs: %s', maskArns(logs))
    } else {
        getLogger().debug('lambda invocation request id: %s', response.$response.requestId)
    }

    const respStr = response.Payload?.toString('utf-8')
    if (!respStr || respStr === 'null') {
        return
    }

    const respPayload = JSON.parse(respStr)
    if (response.FunctionError) {
        const error = new Error()
        error.name = respPayload.errorType || error.name
        error.message = maskArns(respPayload.errorMessage || error.message)

        throw error
    }

    return respPayload
}

function maskArns(text: string) {
    return text.replace(/arn:(aws|aws-cn|aws-us-gov):(?:.*?):(.*?):(.*?):./g, (match, region, account) => {
        if (region) {
            match = match.replace(region, '[omitted]')
        }
        if (account) {
            match = match.replace(account, '[omitted]')
        }

        return match
    })
}

/**
 * Registers a hook to proxy SSO logins to a Lambda function.
 *
 * The function is expected to perform a browser login using the following parameters:
 * * `secret` - a SecretsManager secret containing login credentials.
 * * `userCode` - the user verification code e.g. `ABCD-EFGH`. This is returned by the device authorization flow.
 * * `verificationUri` - the url to login with. This is returned by the device authorization flow.
 */
export function registerAuthHook(secret: string, lambdaId = process.env['AUTH_UTIL_LAMBDA_ARN']) {
    return getTestWindow().onDidShowMessage(message => {
        if (message.items[0].title.match(new RegExp(proceedToBrowser))) {
            if (!lambdaId) {
                const baseMessage = 'Browser login flow was shown during testing without an authorizer function'
                if (process.env['AWS_TOOLKIT_AUTOMATION'] === 'local') {
                    throw new Error(`${baseMessage}. You may need to login manually before running tests.`)
                } else {
                    throw new Error(`${baseMessage}. Check that environment variables are set correctly.`)
                }
            }

            const openStub = patchObject(vscode.env, 'openExternal', async target => {
                try {
                    const url = new URL(target.toString(true))
                    const userCode = url.searchParams.get('user_code')

                    // TODO: Update this to just be the full URL if the authorizer lambda ever
                    // supports the verification URI with user code embedded (VerificationUriComplete).
                    const verificationUri = url.origin

                    await invokeLambda(lambdaId, {
                        secret,
                        userCode,
                        verificationUri,
                    })
                } finally {
                    openStub.dispose()
                }

                return true
            })

            message.items[0].select()
        }
    })
}

/**
 * Calls {@link fn} and disposes {@link disposable} after the function finishes
 */
export function using<T extends (...args: any[]) => any>(
    disposable: vscode.Disposable,
    fn: T,
    ...args: Parameters<T>
): ReturnType<T> {
    let isPromise = false

    try {
        const val = fn(...args)
        if (val instanceof Promise) {
            isPromise = true
            return val.finally(() => disposable.dispose()) as any
        }

        return val
    } finally {
        if (!isPromise) {
            disposable.dispose()
        }
    }
}
