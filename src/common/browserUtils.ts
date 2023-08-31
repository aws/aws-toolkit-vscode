/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

let inBrowser = false
/** Set the value of if we are in the browser. Impacts {@link isInBrowser}. */
export function setInBrowser(value: boolean) {
    inBrowser = value
}
/** Return true if we are running in the browser, false otherwise. */
export function isInBrowser() {
    return inBrowser
}
