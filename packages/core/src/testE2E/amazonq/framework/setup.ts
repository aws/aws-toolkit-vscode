/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Module from 'module'

const originalRequire = Module.prototype.require

export function overrideRequire() {
    Module.prototype.require = new Proxy(Module.prototype.require, {
        apply(target, thisArg, argArray) {
            const name = argArray[0]

            /**
             * HACK: css can't be loaded into jsdom so we have to ignore it
             */
            if (name.endsWith('amazonq-webview.css')) {
                return {}
            }

            return Reflect.apply(target, thisArg, argArray)
        },
    })
}

export function resetRequire() {
    Module.prototype.require = originalRequire
}
