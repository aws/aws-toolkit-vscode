// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import com.adarshr.gradle.testlogger.theme.ThemeType
import software.aws.toolkits.gradle.ciOnly

plugins {
    id("java") // Needed for referencing "implementation" configuration
    id("java-test-fixtures")
    id("jacoco")
    id("org.gradle.test-retry")
    id("com.adarshr.test-logger")
}

// TODO: https://github.com/gradle/gradle/issues/15383
val versionCatalog = extensions.getByType<VersionCatalogsExtension>().named("libs")
dependencies {
    testFixturesApi(versionCatalog.findBundle("mockito").get())
    testFixturesApi(versionCatalog.findLibrary("assertj").get())

    // Everything uses junit4/5 except rider, which uses TestNG
    testFixturesApi(platform(versionCatalog.findLibrary("junit5-bom").get()))
    testFixturesApi(versionCatalog.findLibrary("junit5-jupiterApi").get())
    testFixturesApi(versionCatalog.findLibrary("junit5-jupiterParams").get())

    testRuntimeOnly(versionCatalog.findLibrary("junit5-jupiterEngine").get())
    testRuntimeOnly(versionCatalog.findLibrary("junit5-jupiterVintage").get())
}

sourceSets {
    testFixtures {
        java.setSrcDirs(
            listOf("tstFixtures")
        )
    }
}

jacoco {
    // need to probe resolved dependencies directly if moved to rich version declaration
    toolVersion = versionCatalog.findVersion("jacoco").get().toString()
}

// TODO: Can we model this using https://docs.gradle.org/current/userguide/java_testing.html#sec:java_test_fixtures
val testArtifacts by configurations.creating
val testJar = tasks.register<Jar>("testJar") {
    archiveBaseName.set("${project.name}-test")
    from(sourceSets.test.get().output)
}

// Silly but allows higher throughput of the build because we can start compiling / testing other modules while the tests run
// This works because the sourceSet 'integrationTest' extends 'test', so it won't compile until after 'test' is compiled, but the
// task graph goes 'compileTest*' -> 'test' -> 'compileIntegrationTest*' -> 'testJar'.
// By flipping the order of the graph slightly, we can unblock downstream consumers of the testJar to start running tasks while this project
// can be executing the 'test' task.
tasks.test {
    mustRunAfter(testJar)
}

artifacts {
    add("testArtifacts", testJar)
}

tasks.withType<Test>().all {
    useJUnitPlatform()

    ciOnly {
        retry {
            failOnPassedAfterRetry.set(false)
            maxFailures.set(5)
            maxRetries.set(2)
        }
    }

    reports {
        junitXml.required.set(true)
        html.required.set(true)
    }

    testlogger {
        theme = ThemeType.STANDARD_PARALLEL
        showFullStackTraces = true
        showStandardStreams = true
        showPassedStandardStreams = false
        showSkippedStandardStreams = true
        showFailedStandardStreams = true
    }

    configure<JacocoTaskExtension> {
        // sync with intellij-subplugin
        // don't instrument sdk, icons, etc.
        includes = listOf("software.aws.toolkits.*")
        excludes = listOf("software.aws.toolkits.telemetry.*")

        // 221+ uses a custom classloader and jacoco fails to find classes
        isIncludeNoLocationClasses = true
    }
}

// Jacoco configs taken from official Gradle docs: https://docs.gradle.org/current/userguide/structuring_software_products.html

// Do not generate reports for individual projects, see toolkit-jacoco-report plugin
tasks.jacocoTestReport.configure {
    enabled = false
}

// Share the coverage data to be aggregated for the whole product
// this can be removed once we're using jvm-test-suites properly
configurations.create("coverageDataElements") {
    isVisible = false
    isCanBeResolved = false
    isCanBeConsumed = true
    extendsFrom(configurations.implementation.get())
    attributes {
        attribute(Usage.USAGE_ATTRIBUTE, objects.named(Usage.JAVA_RUNTIME))
        attribute(Category.CATEGORY_ATTRIBUTE, objects.named(Category.DOCUMENTATION))
        attribute(DocsType.DOCS_TYPE_ATTRIBUTE, objects.named("jacoco-coverage-data"))
    }
    tasks.withType<Test> {
        outgoing.artifact(extensions.getByType<JacocoTaskExtension>().destinationFile!!)
    }
}
