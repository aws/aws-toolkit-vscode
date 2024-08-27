// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import io.gitlab.arturbosch.detekt.Detekt
import io.gitlab.arturbosch.detekt.DetektCreateBaselineTask
import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.telemetry.generator.gradle.GenerateTelemetry

plugins {
    id("java-library")
    id("toolkit-testing")
    id("toolkit-intellij-subplugin")
}

buildscript {
    dependencies {
        classpath(libs.telemetryGenerator)
    }
}

sourceSets {
    main {
        java.srcDir(project.layout.buildDirectory.dir("generated-src"))
    }
}

val generateTelemetry = tasks.register<GenerateTelemetry>("generateTelemetry") {
    inputFiles = listOf(file("${project.projectDir}/resources/telemetryOverride.json"))
    outputDirectory = project.layout.buildDirectory.dir("generated-src").get().asFile

    doFirst {
        outputDirectory.deleteRecursively()
    }
}

tasks.compileKotlin {
    dependsOn(generateTelemetry)
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.IC)
}

// expose intellij test framework to fixture consumers
configurations.testFixturesCompileOnlyApi {
    extendsFrom(
        configurations.intellijPlatformTestDependencies.get()
    )
}

// intellij java-test-framework pollutes test classpath with extracted java plugins
configurations.testFixturesApi {
    exclude("com.jetbrains.intellij.java", "java")
    exclude("com.jetbrains.intellij.java", "java-impl")
}

dependencies {
    intellijPlatform {
        testFramework(TestFrameworkType.Plugin.Java)
        testFramework(TestFrameworkType.Platform)
        testFramework(TestFrameworkType.JUnit5)
    }

    compileOnlyApi(project(":plugin-core:core"))
    compileOnlyApi(libs.aws.apacheClient)
    compileOnlyApi(libs.aws.nettyClient)

    api(libs.aws.iam)

    testFixturesApi(project(path = ":plugin-core:core", configuration = "testArtifacts"))
    testFixturesApi(project(":plugin-core:resources"))
    testFixturesApi(libs.wiremock) {
        // conflicts with transitive inclusion from docker plugin
        exclude(group = "org.apache.httpcomponents.client5")
    }

    testImplementation(project(":plugin-core:core"))
    testRuntimeOnly(project(":plugin-core:sdk-codegen"))
}

// fix implicit dependency on generated source
tasks.withType<Detekt>().configureEach {
    dependsOn(generateTelemetry)
}

tasks.withType<DetektCreateBaselineTask>().configureEach {
    dependsOn(generateTelemetry)
}

// hack because our test structure currently doesn't make complete sense
tasks.prepareTestSandbox {
    val pluginXmlJar = project(":plugin-core").tasks.jar

    dependsOn(pluginXmlJar)
    intoChild(intellijPlatform.projectName.map { "$it/lib" })
        .from(pluginXmlJar)
}
