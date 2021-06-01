/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Initiailzes an object from a TypeScript interface, setting all properties to
 * undefined, or initializng them if they are literal interfaces.
 */
 export function initializeInterface<T extends Record<symbol, unknown>>(): T