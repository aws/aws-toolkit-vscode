// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

plugins {
    id("java")
}

dependencies {
    implementation(project(":plugin-amazonq:codewhisperer:jetbrains-community", "instrumentedJar"))
    implementation(project(":plugin-amazonq:codewhisperer:jetbrains-ultimate", "instrumentedJar"))
}
