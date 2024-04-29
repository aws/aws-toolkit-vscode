// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {IdeClient} from "./ideClient";
import {Store} from "vuex";
import {State} from "./model";

export {}

declare global {
    interface Window {
        // TODO: make postMessage api type safe
        ideApi: { postMessage: (arg: { command: string } & any) => any }
        ideClient: IdeClient
        changeTheme: (darkMode: boolean) => void
    }
}

declare module '@vue/runtime-core' {
    interface ComponentCustomProperties {
        $store: Store<State>
    }
}
