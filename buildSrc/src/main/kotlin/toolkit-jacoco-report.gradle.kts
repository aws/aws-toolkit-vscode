// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Taken from https://docs.gradle.org/current/userguide/structuring_software_products.html

plugins {
    id("java-base")
    id("jacoco")
}
// TODO: https://github.com/gradle/gradle/issues/15383
val versionCatalog = extensions.getByType<VersionCatalogsExtension>().named("libs")
jacoco {
    // need to probe resolved dependencies directly if moved to rich version declaration
    toolVersion = versionCatalog.findVersion("jacoco").get().toString()
}

// Configurations to declare dependencies
val aggregateCoverage by configurations.creating {
    isVisible = false
    isCanBeResolved = false
    isCanBeConsumed = false
}

// Resolvable configuration to resolve the classes of all dependencies
val classPath by configurations.creating {
    isVisible = false
    isCanBeResolved = true
    isCanBeConsumed = false
    extendsFrom(aggregateCoverage)
    attributes {
        attribute(Usage.USAGE_ATTRIBUTE, objects.named(Usage.JAVA_RUNTIME))
        attribute(Category.CATEGORY_ATTRIBUTE, objects.named(Category.LIBRARY))
        attribute(LibraryElements.LIBRARY_ELEMENTS_ATTRIBUTE, objects.named(LibraryElements.CLASSES))
        attribute(Bundling.BUNDLING_ATTRIBUTE, objects.named(Bundling.EXTERNAL))
    }
}

// A resolvable configuration to collect source code
val sourcesPath by configurations.creating {
    isVisible = false
    isCanBeResolved = true
    isCanBeConsumed = false
    extendsFrom(aggregateCoverage)
    attributes {
        attribute(Category.CATEGORY_ATTRIBUTE, objects.named(Category.VERIFICATION))
        attribute(Bundling.BUNDLING_ATTRIBUTE, objects.named(Bundling.EXTERNAL))
        attribute(VerificationType.VERIFICATION_TYPE_ATTRIBUTE, objects.named(VerificationType.MAIN_SOURCES))
    }
}

// A resolvable configuration to collect JaCoCo coverage data
val coverageDataPath by configurations.creating {
    isVisible = false
    isCanBeResolved = true
    isCanBeConsumed = false
    extendsFrom(aggregateCoverage)
    attributes {
        attribute(Category.CATEGORY_ATTRIBUTE, objects.named(Category.DOCUMENTATION))
        attribute(DocsType.DOCS_TYPE_ATTRIBUTE, objects.named("jacoco-coverage-data"))
        attribute(Usage.USAGE_ATTRIBUTE, objects.named(Usage.JAVA_RUNTIME))
    }
}

// Register a code coverage report task to generate the aggregated report
tasks.register<JacocoReport>("coverageReport") {
    additionalClassDirs(
        classPath.filter { it.isDirectory }.asFileTree.matching {
            include("**/software/aws/toolkits/**")
            exclude("**/software/aws/toolkits/telemetry/**")
        }
    )

    additionalSourceDirs(sourcesPath.incoming.artifactView { lenient(true) }.files)
    executionData(coverageDataPath.incoming.artifactView { lenient(true) }.files.filter { it.exists() && it.extension == "exec" })

    reports {
        html.required.set(true)
        xml.required.set(true)
    }
}
