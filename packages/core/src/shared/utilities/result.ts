/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnknownError } from '../errors'

abstract class Base<T, E> {
    public abstract readonly type: 'ok' | 'err'
    protected constructor(protected readonly inner: T | E) {}

    public abstract unwrap(): T | never

    public isOk(): this is Ok<T> {
        return this.type === 'ok'
    }

    public isErr(): this is Err<E> {
        return this.type === 'err'
    }

    public map<U>(fn: (val: T) => U): Result<U, E> {
        return this.isErr() ? new Err(this.err()) : new Ok(fn(this.unwrap()))
    }

    public mapOr<D, U>(defaultVal: D, fn: (val: T) => U): D | U {
        return this.isOk() ? fn(this.ok()) : defaultVal
    }

    public mapOrElse<D, U>(okFn: (val: T) => D, errFn: (val: E) => U): D | U {
        return this.isErr() ? errFn(this.err()) : okFn(this.unwrap())
    }

    public mapErr<U>(fn: (val: E) => U): Result<T, U> {
        return this.isErr() ? new Err(fn(this.err())) : new Ok(this.unwrap())
    }

    public unwrapOr<U>(defaultVal: U): T | U {
        return this.isOk() ? this.ok() : defaultVal
    }

    public unwrapOrElse<U>(fn: (val: E) => U): T | U {
        return this.isErr() ? fn(this.err()) : this.unwrap()
    }

    public expect(message: string): T {
        return this.mapErr(err => new ResultError(message, err)).unwrap()
    }

    public maybeOk(): T | undefined {
        return this.isOk() ? this.ok() : undefined
    }

    public and<U, P>(res: Result<U, P>): Result<U, E | P> {
        return this.isErr() ? new Err(this.err()) : res
    }

    public andThen<U, P>(fn: (val: T) => Result<U, P>): Result<U, E | P> {
        return this.isErr() ? new Err(this.err()) : fn(this.unwrap())
    }

    public or<U, P>(res: Result<U, P>): Result<T | U, P> {
        return this.isOk() ? new Ok(this.ok()) : res
    }

    public orElse<U, P>(fn: (val: E) => Result<U, P>): Result<T | U, P> {
        return this.isErr() ? fn(this.err()) : new Ok(this.unwrap())
    }
}

export class Ok<T> extends Base<T, never> {
    public readonly type = 'ok'

    public constructor(val: T) {
        super(val)
    }

    public ok(): T {
        return this.unwrap()
    }

    public unwrap(): T {
        return this.inner
    }
}

export class Err<E> extends Base<never, E> {
    public readonly type = 'err'

    public constructor(val: E) {
        super(val)
    }

    public err(): E {
        return this.inner
    }

    public unwrap(): never {
        throw this.inner
    }
}

export type Result<T, E = unknown> = Ok<T> | Err<E>

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Result {
    export function ok(): Ok<void>
    export function ok<T>(val: T): Ok<T>
    export function ok<T>(val?: T): Ok<T | void> {
        return new Ok(val)
    }

    export function err<E>(val: E): Err<E> {
        return new Err(val)
    }

    export function promise<T>(val: Promise<T>): Promise<Result<T>> {
        return val.then(ok, err) as Promise<Result<T>>
    }
}

export class ResultError<E> extends Error {
    public constructor(message: string, public readonly cause: E) {
        super(message)
    }

    public static cast(err: unknown): Error {
        if (err instanceof Error) {
            return err
        } else if (typeof err === 'string') {
            return new this(err, undefined)
        }

        return UnknownError.cast(err)
    }
}
