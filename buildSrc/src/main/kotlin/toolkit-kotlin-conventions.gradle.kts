// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import io.gitlab.arturbosch.detekt.Detekt
import io.gitlab.arturbosch.detekt.DetektCreateBaselineTask
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile
import software.aws.toolkits.gradle.jvmTarget
import software.aws.toolkits.gradle.kotlinTarget

plugins {
    id("java")
    kotlin("jvm")
    id("toolkit-detekt")
}

// TODO: https://github.com/gradle/gradle/issues/15383
val versionCatalog = extensions.getByType<VersionCatalogsExtension>().named("libs")
dependencies {
    implementation(versionCatalog.findBundle("kotlin").get())
    implementation(versionCatalog.findLibrary("kotlin-coroutines").get())

    testImplementation(versionCatalog.findLibrary("kotlin-test").get())
}

sourceSets {
    main {
        java {
            setSrcDirs(listOf("src"))
        }
        resources {
            setSrcDirs(listOf("resources"))
        }
    }

    test {
        java {
            setSrcDirs(listOf("tst"))
        }
        resources {
            setSrcDirs(listOf("tst-resources"))
        }
    }
}

val javaVersion = project.jvmTarget().get()
java {
    sourceCompatibility = javaVersion
    targetCompatibility = javaVersion
}

tasks.withType<KotlinCompile>().all {
    kotlinOptions {
        jvmTarget = javaVersion.majorVersion
        apiVersion = project.kotlinTarget().get()
        languageVersion = project.kotlinTarget().get()
        freeCompilerArgs = listOf("-Xjvm-default=all")
    }
}

tasks.withType<Detekt>().configureEach {
    jvmTarget = javaVersion.majorVersion
    dependsOn(":detekt-rules:assemble")
    include("**/*.kt")
    exclude("build/**")
    exclude("**/*.Generated.kt")
    exclude("**/TelemetryDefinitions.kt")
}

tasks.withType<DetektCreateBaselineTask>().configureEach {
    jvmTarget = javaVersion.majorVersion
    dependsOn(":detekt-rules:assemble")
    include("**/*.kt")
    exclude("build/**")
    exclude("**/*.Generated.kt")
    exclude("**/TelemetryDefinitions.kt")
}

project.afterEvaluate {
    tasks.check {
        dependsOn(tasks.detekt, tasks.detektMain, tasks.detektTest)

        tasks.findByName("detektIntegrationTest")?.let {
            dependsOn(it)
        }
    }
}
