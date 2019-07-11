/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export enum BlueprintOrigin {
    vsToolkit,
    other // TBD
}

// Enscapsulates a Lambda project blueprint, either from the Visual Studio
// blueprints collection or other sources
export class Blueprint {

    // data members from the Visual Studio blueprint model
    public sortOrder: number | undefined

    public tags: string[] | undefined

    public hiddenTags: string[] | undefined

    public constructor(
        public name: string,
        public description: string,
        public filename: string,
        public origin: BlueprintOrigin
    ) {
    }

    public isForLanguage(language: string): boolean {

        if (this.origin === BlueprintOrigin.vsToolkit) {
            if (this.hiddenTags) {
                return this.hiddenTags.some(hiddenTag => hiddenTag === language)
            }

            return false
        }

        throw new Error('Other blueprint stores are not yet implemented')
    }
}
