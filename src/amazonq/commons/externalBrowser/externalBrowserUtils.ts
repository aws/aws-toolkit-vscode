/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { env, Uri } from 'vscode'

export class ExternalBrowserUtils {
    static #instance: ExternalBrowserUtils

    public static get instance() {
        if (this.#instance !== undefined) {
            return this.#instance
        }

        const self = (this.#instance = new this())
        return self
    }

    public openLink(link: string) {
        env.openExternal(Uri.parse(link))
    }
}
