/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSError } from 'aws-sdk'
import { Result } from './telemetry/telemetry'
import { CancellationError } from './utilities/timeoutUtils'
import { isNonNullable } from './utilities/tsUtils'

interface ErrorInformation {
    /**
     * Error names are optional, but if provided they should be generic yet self-explanatory.
     *
     * A name does not need to precisely describe why something failed and instead should focus
     * on the overarching theme or module that caused the problem. For example, VS Code uses
     * `FileSystemError` for a diverse range of problems relating to their file system API.
     *
     * The choice of granularity for an error name largely comes down to what other errors are
     * possible; names are meant to immediately disambiguate from the potentially thousands of
     * other causes for a failure. If there is any doubt that a certain name might be confusing,
     * opt for something more specific and verbose.
     */
    readonly name?: string

    /**
     * An error code is used to describe specific failure modes within entire classes of errors.
     *
     * The exact value used here is free-form but should be kept stable whenever possible.
     * Value stability is especially important if any error handling logic directly relies on
     * error codes. Prefer using {@link ToolkitError.named} and narrowing this class if any
     * substantial logic is needed for handling specific error codes.
     *
     * As an example, one might choose to describe SSO error codes for extra type-safety:
     * ```ts
     * enum CreateTokenErrorCode {
     *     SlowDown = 'SlowDownException',
     *     ExpiredToken = 'ExpiredTokenException',
     *     UnauthorizedClient = 'UnauthorizedClientException',
     *     AuthorizationPending = 'AuthorizationPendingException',
     * }
     *
     * class CreateTokenError extends ToolkitError.named('CreateTokenError') {
     *     public constructor(public readonly code: CreateTokenErrorCode) {
     *         super('Failed to create SSO access token', { code })
     *     }
     * }
     * ```
     */
    readonly code?: string

    /**
     * Used to describe errors with a direct cause-effect relationship.
     *
     * See {@link code} for creating descriptive errors without a chainable root cause.
     */
    readonly cause?: Error

    /**
     * Structured information that may be used for logging.
     *
     * Consumers should strictly use this field for observability purposes as producers can
     * put whatever they want here.
     */
    readonly details?: Record<string, unknown>

    /**
     * Flag to determine if the error was from a user-initiated cancellation.
     */
    readonly cancelled?: boolean
}

/**
 * Anonymous class with a pre-defined error name.
 */
interface NamedErrorConstructor {
    /**
     * See {@link ToolkitError}
     */
    new (message: string, info?: Omit<ErrorInformation, 'name'>): ToolkitError

    /**
     * See {@link ToolkitError.chain}
     */
    chain<T extends this>(
        this: T,
        error: unknown,
        message: string,
        info?: Omit<ErrorInformation, 'name' | 'cause'>
    ): InstanceType<T>
}

/**
 * Generic error class for handling exceptions within the Toolkit.
 */
export class ToolkitError extends Error implements ErrorInformation {
    /**
     * A message that could potentially be shown to the user. This should not contain any
     * sensitive information and should be limited in technical detail.
     */
    public readonly message: string
    public readonly code = this.info.code
    public readonly details = this.info.details

    /**
     * We guard against mutation to stop a developer from creating a circular chain of errors.
     * The alternative is to truncate errors to an arbitrary depth though that doesn't address
     * why the error chain is deep.
     */
    readonly #cause = this.info.cause
    readonly #name = this.info.name ?? super.name

    public constructor(message: string, protected readonly info: ErrorInformation = {}) {
        super(message)
        this.message = message
    }

    /**
     * The original error that caused this error (if any).
     */
    public get cause(): Error | undefined {
        return this.#cause
    }

    /**
     * The name of the error. This is not necessarily the same as the class name.
     */
    public get name(): string {
        return this.#name
    }

    /**
     * See {@link ErrorInformation.cancelled cancelled}.
     *
     * Whether or not an error is considered 'cancelled' is determined either by explicit
     * assignment on construction or by finding a 'cancelled' error within its causal chain.
     */
    public get cancelled(): boolean {
        return this.info.cancelled ?? isUserCancelledError(this.cause)
    }

    /**
     * A formatted string that is analogous to a stack trace. While stack traces enumerate every
     * call site, this trace enumerates every throw site.
     *
     * The motivation here is that stack traces are often not very useful to anyone but the original
     * developers. This is especially true for JavaScript where source maps are needed to parse traces
     * from bundled applications. We want a trace that is informative but not excessively noisy.
     */
    public get trace(): string {
        const message = formatError(this)

        if (!this.cause) {
            return message
        }

        // Stack overflows are only possible if `cause` is changed after instantiation
        const residual = this.cause instanceof ToolkitError ? this.cause.trace : formatError(this.cause)

        return `${message}\n\t -> ${residual}`
    }

    /**
     * Creates a new {@link ToolkitError} instance that was directly caused by another {@link error}.
     */
    public static chain(error: unknown, message: string, info?: Omit<ErrorInformation, 'cause'>): ToolkitError {
        return new this(message, {
            ...info,
            cause: UnknownError.cast(error),
        })
    }

    /**
     * Creates a new {@link ToolkitError} _class_ with a constant name.
     *
     * Constructor (class) names are not preserved when bundling due to name mangling. Extending off
     * this new anonymous class will ensure that the specified name is always present.
     */
    public static named(name: string): NamedErrorConstructor {
        return class extends ToolkitError {
            public override get name() {
                return name
            }

            // TypeScript does not allow the use of `this` types for generic prototype methods unfortunately
            // This implementation is equivalent to re-assignment i.e. an unbound method on the prototype
            public static chain<T extends new (...args: ConstructorParameters<NamedErrorConstructor>) => ToolkitError>(
                this: T,
                ...args: Parameters<NamedErrorConstructor['chain']>
            ): InstanceType<T> {
                return ToolkitError.chain.call(this, ...args) as InstanceType<T>
            }
        }
    }
}

export function formatError(err: Error): string {
    const code = hasCode(err) && err.code !== err.name ? `[${err.code}]` : undefined
    const parts = [`${err.name}:`, err.message, code, formatDetails(err)]

    return parts.filter(isNonNullable).join(' ')
}

function formatDetails(err: Error): string | undefined {
    const details: Record<string, string | undefined> = {}

    if (err instanceof ToolkitError && err.details !== undefined) {
        for (const [k, v] of Object.entries(err.details)) {
            details[k] = String(v)
        }
    } else if (isAwsError(err)) {
        details['statusCode'] = String(err.statusCode ?? '')
        details['requestId'] = err.requestId
        details['extendedRequestId'] = err.extendedRequestId
    }

    if (Object.keys(details).length === 0) {
        return
    }

    const joined = Object.entries(details)
        .filter(([_, v]) => !!v)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ')

    return `(${joined})`
}

export class UnknownError extends Error {
    public readonly name = 'UnknownError'

    public constructor(public readonly cause: unknown) {
        super(String(cause))
    }

    public static cast(obj: unknown): Error {
        return obj instanceof Error ? obj : new UnknownError(obj)
    }
}

export function getTelemetryResult(error: unknown | undefined): Result {
    if (error === undefined) {
        return 'Succeeded'
    } else if (isUserCancelledError(error)) {
        return 'Cancelled'
    }

    return 'Failed'
}

export function getTelemetryReason(error: unknown | undefined): string | undefined {
    // Currently the `code` field is favored over the error name even though both are useful
    // for describing the reason. We're only using a single `reason` field and it's just simpler
    // to not encode more information.

    if (error === undefined) {
        return undefined
    } else if (error instanceof CancellationError) {
        return error.agent
    } else if (error instanceof ToolkitError) {
        return getTelemetryReason(error.cause) ?? error.code ?? error.name
    } else if (error instanceof Error) {
        return (error as { code?: string }).code ?? error.name
    }

    return 'Unknown'
}

export function isAwsError(error: unknown | undefined): error is AWSError {
    if (error === undefined) {
        return false
    }

    return error instanceof Error && hasCode(error) && (error as { time?: unknown }).time instanceof Date
}

function hasCode(error: Error): error is typeof error & { code: string } {
    return typeof (error as { code?: unknown }).code === 'string'
}

export function isUserCancelledError(error: unknown): boolean {
    return CancellationError.isUserCancelled(error) || (error instanceof ToolkitError && error.cancelled)
}
