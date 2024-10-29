#!/usr/bin/env node
const sh = require("shelljs");
const fs = require("fs");
const ts = require("typescript");
const path = require("path");
const assert = require("assert");
const semver = require("semver");

/** @typedef {import("typescript").Node} Node */
/**
 * @param {string} src
 * @param {string} target
 * @param {import("semver").SemVer} targetVersion
 */
function main(src, target, targetVersion) {
  if (!src || !target) {
    console.log("Usage: node index.js test test/ts3.4 [--to=3.4]");
    process.exit(1);
  }

  // TODO: target path is probably wrong for absolute src (or target?)
  // TODO: Probably will want to alter package.json if discovered in the right place.
  const program = ts.createProgram(
    sh.find(path.join(src)).filter(f => f.endsWith(".d.ts") && !/node_modules/.test(f)),
    {}
  );
  const checker = program.getTypeChecker(); // just used for setting parent pointers right now
  const files = mapDefined(program.getRootFileNames(), program.getSourceFile);
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.CarriageReturnLineFeed
  });
  for (const t of ts.transform(files, [doTransform.bind(null, checker, targetVersion)]).transformed) {
    const f = /** @type {import("typescript").SourceFile} */ (t);
    const targetPath = path.join(target, path.resolve(f.fileName).slice(path.resolve(src).length));
    sh.mkdir("-p", path.dirname(targetPath));
    fs.writeFileSync(targetPath, dedupeTripleSlash(printer.printFile(f)));
  }
}
module.exports.main = main;

if (!(/** @type {*} */ (module.parent))) {
  const src = process.argv[2];
  const target = process.argv[3];
  const to = process.argv.find(arg => arg.startsWith("--to"));
  /** @type {*} */ let targetVersion = semver.minVersion("3.4.0");
  if (to) {
    const userInput = semver.coerce(to.split("=")[1]);
    if (userInput) targetVersion = userInput;
  }
  main(src, target, targetVersion);
}

/**
 * @param {import("typescript").TypeChecker} checker
 * @param {import("semver").SemVer} targetVersion
 * @param {import("typescript").TransformationContext} k
 */
function doTransform(checker, targetVersion, k) {
  /**
   * @param {Node} n
   * @return {import("typescript").VisitResult<Node>}
   */
  const transform = function(n) {
    if (semver.lt(targetVersion, "3.7.0")) {
      if (ts.isFunctionTypeNode(n) && n.type && ts.isTypePredicateNode(n.type) && n.type.assertsModifier) {
        return ts.factory.createFunctionTypeNode(
          n.typeParameters,
          n.parameters,
          ts.factory.createTypeReferenceNode("void", undefined)
        );
      }

      if (ts.isFunctionDeclaration(n) && n.type && ts.isTypePredicateNode(n.type) && n.type.assertsModifier) {
        return ts.factory.createFunctionDeclaration(
          n.modifiers,
          n.asteriskToken,
          n.name,
          n.typeParameters,
          n.parameters,
          ts.factory.createTypeReferenceNode("void", undefined),
          n.body
        );
      }
    }

    if (semver.lt(targetVersion, "3.6.0") && ts.isGetAccessor(n)) {
      // get x(): number => x: number
      let flags = ts.getCombinedModifierFlags(n);
      const other = getMatchingAccessor(n, "get");
      if (!other) {
        flags |= ts.ModifierFlags.Readonly;
      }
      const modifiers = ts.factory.createModifiersFromModifierFlags(flags);
      return copyComment(
        other ? [n, other] : [n],
        ts.factory.createPropertyDeclaration(
          modifiers,
          n.name,
          /*?! token*/ undefined,
          defaultAny(n.type),
          /*initialiser*/ undefined
        )
      );
    } else if (semver.lt(targetVersion, "3.6.0") && ts.isSetAccessor(n)) {
      // set x(value: number) => x: number
      if (getMatchingAccessor(n, "set")) {
        return undefined;
      } else {
        assert(n.parameters && n.parameters.length);
        return copyComment(
          [n],
          ts.factory.createPropertyDeclaration(
            n.modifiers,
            n.name,
            /*?! token*/ undefined,
            defaultAny(n.parameters[0].type),
            /*initialiser*/ undefined
          )
        );
      }
    } else if (semver.lt(targetVersion, "3.6.0") && isTypeReference(n, "IteratorResult")) {
      const symbol = checker.getSymbolAtLocation(ts.isTypeReferenceNode(n) ? n.typeName : n.expression);
      const typeArguments = n.typeArguments;
      if (isStdLibSymbol(symbol) && typeArguments) {
        return ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("IteratorResult"), [typeArguments[0]]);
      }
    } else if (
      semver.lt(targetVersion, "3.8.0") &&
      ts.isPropertyDeclaration(n) &&
      ts.isPrivateIdentifier(n.name) &&
      n.name.escapedText === "#private"
    ) {
      // #private => private "#private"
      const modifiers = ts.factory.createModifiersFromModifierFlags(ts.ModifierFlags.Private);
      const parentName = n.parent.name ? n.parent.name.escapedText : "(anonymous)";
      return ts.factory.createPropertyDeclaration(
        modifiers,
        ts.factory.createStringLiteral(parentName + ".#private"),
        /*?! token*/ undefined,
        /*type*/ undefined,
        /*initialiser*/ undefined
      );
    } else if (
      semver.lt(targetVersion, "3.8.0") &&
      ts.isExportDeclaration(n) &&
      n.exportClause &&
      n.moduleSpecifier &&
      ts.isNamespaceExport(n.exportClause)
    ) {
      // export * as ns from 'x'
      //  =>
      // import * as ns_1 from 'x'
      // export { ns_1 as ns }
      const tempName = ts.factory.createUniqueName(n.exportClause.name.getText());
      return [
        ts.factory.createImportDeclaration(
          n.modifiers,
          ts.factory.createImportClause(false, /*name*/ undefined, ts.factory.createNamespaceImport(tempName)),
          n.moduleSpecifier
        ),
        copyComment(
          [n],
          ts.factory.createExportDeclaration(
            undefined,
            false,
            ts.factory.createNamedExports([ts.factory.createExportSpecifier(false, tempName, n.exportClause.name)])
          )
        )
      ];
    } else if (semver.lt(targetVersion, "3.8.0") && ts.isExportDeclaration(n) && n.isTypeOnly) {
      return ts.factory.createExportDeclaration(n.modifiers, false, n.exportClause, n.moduleSpecifier);
    } else if (semver.lt(targetVersion, "3.8.0") && ts.isImportClause(n) && n.isTypeOnly) {
      return ts.factory.createImportClause(false, n.name, n.namedBindings);
    } else if (
      semver.lt(targetVersion, "4.5.0") &&
      ts.isImportDeclaration(n) &&
      !n.modifiers &&
      n.importClause &&
      !n.importClause.isTypeOnly &&
      n.importClause.namedBindings &&
      ts.isNamedImports(n.importClause.namedBindings) &&
      n.importClause.namedBindings.elements.some(e => e.isTypeOnly)
    ) {
      const elements = n.importClause.namedBindings.elements;

      if (semver.lt(targetVersion, "3.8.0")) {
        // import { A, type B } from 'x'
        // =>
        // import { A, B } from 'x'
        return copyComment(
          [n],
          ts.factory.createImportDeclaration(
            n.modifiers,
            ts.factory.createImportClause(
              false,
              n.importClause.name,
              ts.factory.createNamedImports(
                elements.map(e => ts.factory.createImportSpecifier(false, e.propertyName, e.name))
              )
            ),
            n.moduleSpecifier
          )
        );
      }

      const typeElements = [];
      const valueElements = [];
      for (const e of elements) {
        if (e.isTypeOnly) {
          typeElements.push(e);
        } else {
          valueElements.push(e);
        }
      }

      // import { type A, type B, ... } from 'x'
      // =>
      // import type { A, B } from 'x'
      const typeOnlyImportDeclaration = copyComment(
        [n],
        ts.factory.createImportDeclaration(
          n.modifiers,
          ts.factory.createImportClause(
            true,
            n.importClause.name,
            ts.factory.createNamedImports(
              typeElements.map(e => ts.factory.createImportSpecifier(false, e.propertyName, e.name))
            )
          ),
          n.moduleSpecifier
        )
      );

      if (valueElements.length === 0) {
        // import { type A, type B } from 'x'
        // =>
        // import type { A, B } from 'x'
        return typeOnlyImportDeclaration;
      } else {
        // import { A, type B } from 'x'
        // =>
        // import type { B } from 'x'
        // import { A } from 'x'
        return [
          typeOnlyImportDeclaration,
          ts.factory.createImportDeclaration(
            n.modifiers,
            ts.factory.createImportClause(
              false,
              n.importClause.name,
              ts.factory.createNamedImports(
                valueElements.map(e => ts.factory.createImportSpecifier(false, e.propertyName, e.name))
              )
            ),
            n.moduleSpecifier
          )
        ];
      }
    } else if (
      semver.lt(targetVersion, "4.5.0") &&
      ts.isExportDeclaration(n) &&
      !n.modifiers &&
      !n.isTypeOnly &&
      n.exportClause &&
      ts.isNamedExports(n.exportClause) &&
      n.exportClause.elements.some(e => e.isTypeOnly)
    ) {
      const elements = n.exportClause.elements;

      if (semver.lt(targetVersion, "3.8.0")) {
        // export { A, type B }
        // export { C, type D } from 'x'
        // =>
        // export { A, B }
        // export { C, D } from 'x'
        return copyComment(
          [n],
          ts.factory.createExportDeclaration(
            n.modifiers,
            false,
            ts.factory.createNamedExports(
              elements.map(e => ts.factory.createExportSpecifier(false, e.propertyName, e.name))
            ),
            n.moduleSpecifier
          )
        );
      }

      const typeElements = [];
      const valueElements = [];
      for (const e of elements) {
        if (e.isTypeOnly) {
          typeElements.push(e);
        } else {
          valueElements.push(e);
        }
      }

      // export { type A, type B, ... }
      // export { type C, type D, ... } from 'x'
      // =>
      // export type { A, B }
      // export type { C, D } from 'x'
      const typeOnlyExportDeclaration = copyComment(
        [n],
        ts.factory.createExportDeclaration(
          n.modifiers,
          true,
          ts.factory.createNamedExports(
            typeElements.map(e => ts.factory.createExportSpecifier(false, e.propertyName, e.name))
          ),
          n.moduleSpecifier
        )
      );

      if (valueElements.length === 0) {
        // export { type A, type B }
        // export { type C, type D } from 'x'
        // =>
        // export type { A, B }
        // export type { C, D } from 'x'
        return typeOnlyExportDeclaration;
      } else {
        // export { A, type B }
        // export { C, type D } from 'x'
        // =>
        // export type { B }
        // export { A }
        // export type { C } from 'x'
        // export { D } from 'x'
        return [
          typeOnlyExportDeclaration,
          ts.factory.createExportDeclaration(
            n.modifiers,
            false,
            ts.factory.createNamedExports(
              valueElements.map(e => ts.factory.createExportSpecifier(false, e.propertyName, e.name))
            ),
            n.moduleSpecifier
          )
        ];
      }
    } else if (isTypeReference(n, "Omit")) {
      const symbol = checker.getSymbolAtLocation(ts.isTypeReferenceNode(n) ? n.typeName : n.expression);
      const typeArguments = n.typeArguments;

      if (semver.lt(targetVersion, "3.5.0") && isStdLibSymbol(symbol) && typeArguments) {
        return ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Pick"), [
          typeArguments[0],
          ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Exclude"), [
            ts.factory.createTypeOperatorNode(ts.SyntaxKind.KeyOfKeyword, typeArguments[0]),
            typeArguments[1]
          ])
        ]);
      }
    } else if (semver.lt(targetVersion, "4.0.0") && n.kind === ts.SyntaxKind.NamedTupleMember) {
      const member = /** @type {import("typescript").NamedTupleMember} */ (n);
      return ts.addSyntheticLeadingComment(
        member.dotDotDotToken ? ts.factory.createRestTypeNode(member.type) : member.type,
        ts.SyntaxKind.MultiLineCommentTrivia,
        ts.unescapeLeadingUnderscores(member.name.escapedText),
        /*hasTrailingNewline*/ false
      );
    } else if (semver.lt(targetVersion, "4.7.0") && ts.isTypeParameterDeclaration(n)) {
      return ts.factory.createTypeParameterDeclaration(
        n.modifiers?.filter(
          modifier => modifier.kind !== ts.SyntaxKind.InKeyword && modifier.kind !== ts.SyntaxKind.OutKeyword
        ),
        n.name,
        n.constraint,
        n.default
      );
    }
    return ts.visitEachChild(n, transform, k);
  };
  return transform;
}
/** @param {import("typescript").TypeNode | undefined} t */
function defaultAny(t) {
  return t || ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
}

/**
 * @param {import("typescript").AccessorDeclaration} n
 * @param {'get' | 'set'} getset
 */
function getMatchingAccessor(n, getset) {
  if (!ts.isClassDeclaration(n.parent)) throw new Error("Bad AST -- accessor parent should be a class declaration.");
  const isOther = getset === "get" ? ts.isSetAccessor : ts.isGetAccessor;
  return n.parent.members.find(m => isOther(m) && m.name.getText() === n.name.getText());
}

/**
 * @param {Node[]} originals
 * @param {Node} rewrite
 */
function copyComment(originals, rewrite) {
  const file = originals[0].getSourceFile().getFullText();
  const ranges = flatMap(originals, o => {
    const comments = ts.getLeadingCommentRanges(file, o.getFullStart());
    return comments ? comments : [];
  });
  if (!ranges.length) return rewrite;

  let kind = ts.SyntaxKind.SingleLineCommentTrivia;
  let hasTrailingNewline = false;
  const commentText = flatMap(ranges, r => {
    if (r.kind === ts.SyntaxKind.MultiLineCommentTrivia) kind = ts.SyntaxKind.MultiLineCommentTrivia;
    hasTrailingNewline = hasTrailingNewline || !!r.hasTrailingNewLine;
    const comment = file.slice(r.pos, r.end);
    const text = comment.startsWith("//") ? comment.slice(2) : comment.slice(3, comment.length - 2);
    return text.split("\n").map(line => line.trimStart());
  }).join("\n");
  return ts.addSyntheticLeadingComment(rewrite, kind, commentText, hasTrailingNewline);
}

/** @param {string} s */
function dedupeTripleSlash(s) {
  const lines = s.split("\n");
  const i = lines.findIndex(line => !line.startsWith("/// <reference "));
  return [...new Set(lines.slice(0, i)), ...lines.slice(i)].join("\n");
}

/**
 * @template T,U
 * @param {readonly T[]} l
 * @param {(t: T) => U | false | undefined} f
 * @return {U[]}
 */
function mapDefined(l, f) {
  const acc = [];
  for (const x of l) {
    const y = f(x);
    if (y) acc.push(y);
  }
  return acc;
}

/**
 * @template T,U
 * @param {readonly T[]} l
 * @param {(t: T) => U[]} f
 * @return {U[]}
 */
function flatMap(l, f) {
  if (l.flatMap) return l.flatMap(f);
  const acc = [];
  for (const x of l) {
    const ys = f(x);
    acc.push(...ys);
  }
  return acc;
}

/**
 * Checks whether a node is a type reference with typeName as a name
 * @param {ts.Node} node AST node
 * @param {string} typeName name of the type
 * @returns {node is ts.TypeReferenceNode | ts.ExpressionWithTypeArguments} true if the node is a type reference with typeName as a name
 */
function isTypeReference(node, typeName) {
  return (
    (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.escapedText === typeName) ||
    (ts.isExpressionWithTypeArguments(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.escapedText === typeName)
  );
}

/**
 * Returns whether a symbol is a standard TypeScript library definition
 * @param {ts.Symbol | undefined} symbol a symbol in source file
 * @returns whether this symbol is for a standard TypeScript library definition
 */
function isStdLibSymbol(symbol) {
  return (
    symbol &&
    symbol.declarations &&
    symbol.declarations.length &&
    symbol.declarations[0].getSourceFile().fileName.includes("node_modules/typescript/lib/lib")
  );
}
