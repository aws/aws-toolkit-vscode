'use strict';

export enum BlueprintOrigin {
    vsToolkit,
    other // TBD
}

// Enscapsulates a Lambda project blueprint, either from the Visual Studio
// blueprints collection or other sources
export class Blueprint {

    // data members from the Visual Studio blueprint model
    public sortOrder: number | undefined;

    public tags: string[] | undefined;

    public hiddenTags: string[] | undefined;

    constructor(public name: string, public description: string, public filename: string, public origin: BlueprintOrigin) {
    }

    public isForLanguage(language: string): boolean {

        if (this.origin === BlueprintOrigin.vsToolkit) {
            if (this.hiddenTags) {
                for (let i: number = 0; i < this.hiddenTags.length; i++) {
                    if (this.hiddenTags[i] === language) {
                        return true;
                    }
                }
            }

            return false;
        }

        throw new Error('Other blueprint stores are not yet implemented');
    }
}