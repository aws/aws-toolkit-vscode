// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

plugins {
    id("temp-toolkit-intellij-root-conventions")
}

intellij {
    pluginName.set("aws-toolkit-jetbrains-standalone")
    plugins.add(project(":plugin-core"))
}
