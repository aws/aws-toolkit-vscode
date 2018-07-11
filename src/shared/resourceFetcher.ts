'use strict';

import request = require('request');
import * as fse from 'fs-extra';

export abstract class ResourceFetcher {

    // Attempts to retrieve a resource from the toolkit's hosted files, if it fails
    // and a fallback resource name is given, the embedded resource is returned
    // in its place.
    // TODO: optionally cache the download, like the VS toolkit does, and add the
    // cache into the probing path
    public static async fetchHostedResource(url: string, fallbackResourcePath: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {

            // TODO: inject cache lookup here

            // cache failed or is out of date, go online and fetch it
            request(url, {}, (err, res, body) => {

                if (err) {
                    if (fallbackResourcePath) {
                        // couldn't reach online version, if we know it's locally available
                        // as a resource in the extension then supply from there
                        try {
                            const content = fse.readFileSync(fallbackResourcePath).toString();
                            resolve(content);
                        } catch (err) {
                        }
                    }

                    reject(err);
                } else {
                    resolve(body);
                }
            });
        });
    }
}