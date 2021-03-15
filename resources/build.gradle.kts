// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import de.undercouch.gradle.tasks.download.Download
import software.aws.toolkits.gradle.resources.ValidateMessages

val kotlinVersion: String by project

plugins {
    id("de.undercouch.download")
}

sourceSets {
    main {
        resources.srcDir("$buildDir/downloaded-resources")
    }
}

dependencies {
    testImplementation("org.jetbrains.kotlin:kotlin-stdlib-jdk8:$kotlinVersion")
}

val download = tasks.register<Download>("downloadResources") {
    dest("$buildDir/downloaded-resources/software/aws/toolkits/resources/")
    src(listOf("https://idetoolkits.amazonwebservices.com/endpoints.json"))
    onlyIfModified(true)
    useETag(true)
    doFirst {
        mkdir("$buildDir/downloaded-resources/software/aws/toolkits/resources/")
    }
}

tasks.named("processResources") {
    dependsOn(download)
}

val validateLocalizedMessages = tasks.register<ValidateMessages>("validateLocalizedMessages") {
    paths.from("resources/software/aws/toolkits/resources/MessagesBundle.properties")
}

tasks.named("check") {
    dependsOn(validateLocalizedMessages)
}
