/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface NpmPackage {
    name: string
    displayName: string
    description: string
    version: string
    publisher: string
    repository: string
    engines: {
        [ engine: string ]: string
    }
    categories: string[]
    activationEvents: string[]
    main: string
    contributes: {
        configuration: {
            type: string
            title: string
            properties: {
                [ key: string ]: {
                    type: string
                    default: any
                    description?: string
                    markdownDescription?: string
                }
            }
        }
        viewsContainers: {
            [ key: string ]: {
                id: string
                title: string
                icon: string
            }[]
        }
        views: {
            [ key: string ]: {
                id: string
                name: string
            }[]
        }
        menus: {
            [ key: string ]: {
                command: string
                when: string
                group: string
            }[]
        }
        commands: {
            command: string
            title: string
            category: string
            icon?: {
                light: string
                dark: string
            }
        }[]
    }
    scripts: {
        [ key: string ]: string
    }
    devDependencies: {
        [ key: string ]: string
    }
    dependencies: {
        [ key: string ]: string
    }
}
