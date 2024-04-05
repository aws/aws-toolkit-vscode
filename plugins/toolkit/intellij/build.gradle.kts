// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

plugins {
    id("temp-toolkit-intellij-root-conventions")
}

dependencies {
    // delete when fully split
    implementation(project(":plugin-amazonq", "moduleOnlyJars"))
    implementation(project(":plugin-core:jetbrains-community"))
    implementation(project(":plugin-core:jetbrains-ultimate"))
}
