/**
 * AIDriver Simulator - Code Validator
 * Enforces strict usage of the AIDriver library
 */

const Validator = (function () {
  "use strict";

  // Allowed imports
  const ALLOWED_IMPORTS = new Set(["aidriver", "time"]);

  // Allowed from aidriver imports
  const ALLOWED_FROM_AIDRIVER = new Set(["AIDriver", "hold_state"]);

  // Allowed function calls (builtins + aidriver functions)
  const ALLOWED_FUNCTIONS = new Set([
    // Core Python builtins
    "print",
    "range",
    "len",
    "int",
    "float",
    "str",
    "bool",
    "list",
    "dict",
    "tuple",
    "set",
    "abs",
    "min",
    "max",
    "sum",
    "round",
    "type",
    "isinstance",
    // AIDriver functions
    "AIDriver",
    "hold_state",
  ]);

  // Allowed builtins
  const ALLOWED_BUILTINS = new Set([
    // Core Python builtins
    "print",
    "range",
    "len",
    "int",
    "float",
    "str",
    "bool",
    "list",
    "dict",
    "tuple",
    "set",
    "abs",
    "min",
    "max",
    "sum",
    "round",
    "type",
    "isinstance",
    "True",
    "False",
    "None",
    // Control flow related
    "break",
    "continue",
    "pass",
    // Exceptions
    "Exception",
    "ValueError",
    "TypeError",
    "RuntimeError",
  ]);

  // AIDriver class allowed methods
  const AIDRIVER_METHODS = new Set([
    "drive_forward",
    "drive_backward",
    "rotate_left",
    "rotate_right",
    "brake",
    "drive",
    "read_distance",
    "read_distance_2",
    "is_moving",
    "get_motor_speeds",
    "set_motor_speeds",
  ]);

  // Forbidden patterns - things we don't want in student code
  const FORBIDDEN_PATTERNS = [
    { pattern: /\bexec\s*\(/, message: "exec() is not allowed" },
    { pattern: /\beval\s*\(/, message: "eval() is not allowed" },
    {
      pattern: /\bopen\s*\(/,
      message: "open() is not allowed (no file access)",
    },
    { pattern: /\b__import__\s*\(/, message: "__import__() is not allowed" },
    { pattern: /\bcompile\s*\(/, message: "compile() is not allowed" },
    { pattern: /\bglobals\s*\(/, message: "globals() is not allowed" },
    { pattern: /\blocals\s*\(/, message: "locals() is not allowed" },
    { pattern: /\bgetattr\s*\(/, message: "getattr() is not allowed" },
    { pattern: /\bsetattr\s*\(/, message: "setattr() is not allowed" },
    { pattern: /\bdelattr\s*\(/, message: "delattr() is not allowed" },
    { pattern: /\bimport\s+os\b/, message: "os module is not allowed" },
    { pattern: /\bimport\s+sys\b/, message: "sys module is not allowed" },
    {
      pattern: /\bimport\s+subprocess\b/,
      message: "subprocess module is not allowed",
    },
    { pattern: /\bfrom\s+os\s+import/, message: "os module is not allowed" },
    { pattern: /\bfrom\s+sys\s+import/, message: "sys module is not allowed" },
  ];

  /**
   * Parse Python import statements into a normalized structure that captures
   * import style, modules, aliases, and the originating line numbers. Supports
   * both `import module` and `from module import ...` forms to drive further
   * validation logic.
   *
   * @param {string} code Raw Python source to scan.
   * @returns {Array<{type:string,module:string,line:number,names?:Array<string>}>} Structured import metadata entries.
   */
  function parseImports(code) {
    const imports = [];
    const lines = code.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // Match "import module" or "import module as alias"
      const importMatch = line.match(/^import\s+(\w+)(?:\s+as\s+\w+)?$/);
      if (importMatch) {
        imports.push({
          type: "import",
          module: importMatch[1],
          line: lineNum,
        });
        continue;
      }

      // Match "from module import ..."
      const fromMatch = line.match(/^from\s+(\w+)\s+import\s+(.+)$/);
      if (fromMatch) {
        const module = fromMatch[1];
        const names = fromMatch[2]
          .split(",")
          .map((n) => n.trim().split(/\s+as\s+/)[0]);
        imports.push({
          type: "from",
          module: module,
          names: names,
          line: lineNum,
        });
      }
    }

    return imports;
  }

  /**
   * Run static validation over learner Python code, enforcing allowed imports
   * and APIs while flagging obvious syntax issues and usage omissions. Combines
   * hard errors for forbidden behaviour with softer warnings that highlight
   * likely mistakes.
   *
   * @param {string} code Python source string to examine.
   * @returns {{valid:boolean,errors:Array<object>,warnings:Array<object>}} Aggregated validation result set.
   */
  function validate(code) {
    const errors = [];
    const warnings = [];

    // Check for forbidden patterns
    for (const { pattern, message } of FORBIDDEN_PATTERNS) {
      const match = code.match(pattern);
      if (match) {
        // Find line number
        const beforeMatch = code.substring(0, match.index);
        const lineNum = beforeMatch.split("\n").length;
        errors.push({
          line: lineNum,
          message: message,
          type: "forbidden",
        });
      }
    }

    // Parse and validate imports
    const imports = parseImports(code);
    let hasAIDriverImport = false;

    for (const imp of imports) {
      if (imp.type === "import") {
        if (!ALLOWED_IMPORTS.has(imp.module)) {
          errors.push({
            line: imp.line,
            message: `Module '${imp.module}' is not allowed. Only 'aidriver' and 'time' are permitted.`,
            type: "import",
          });
        }
        if (imp.module === "aidriver") {
          hasAIDriverImport = true;
        }
      } else if (imp.type === "from") {
        if (!ALLOWED_IMPORTS.has(imp.module)) {
          errors.push({
            line: imp.line,
            message: `Module '${imp.module}' is not allowed. Only 'aidriver' is permitted.`,
            type: "import",
          });
        } else if (imp.module === "aidriver") {
          hasAIDriverImport = true;
          for (const name of imp.names) {
            if (name !== "*" && !ALLOWED_FROM_AIDRIVER.has(name)) {
              warnings.push({
                line: imp.line,
                message: `'${name}' is not a known export from aidriver. Expected: AIDriver, hold_state`,
                type: "import",
              });
            }
          }
        }
      }
    }

    // Check if aidriver is imported
    if (!hasAIDriverImport) {
      warnings.push({
        line: 1,
        message:
          "No aidriver import found. You need to import AIDriver to control the robot.",
        type: "import",
      });
    }

    // Check for AIDriver instantiation
    if (!code.includes("AIDriver(")) {
      warnings.push({
        line: 1,
        message:
          "No AIDriver instance created. You need to create an AIDriver object.",
        type: "usage",
      });
    }

    // Check for basic syntax issues using simple heuristics
    const syntaxChecks = checkBasicSyntax(code);
    errors.push(...syntaxChecks.errors);
    warnings.push(...syntaxChecks.warnings);

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
    };
  }

  /**
   * Apply lightweight heuristics to detect common Python syntax mistakes
   * without invoking a full parser. Targets missing colons, accidental typos,
   * and unbalanced delimiters while ignoring multi-line strings.
   *
   * @param {string} code Python program text.
   * @returns {{errors:Array<object>,warnings:Array<object>}} Categorised issues discovered during scanning.
   */
  function checkBasicSyntax(code) {
    const errors = [];
    const warnings = [];
    const lines = code.split("\n");

    let inMultilineString = false;
    let multilineStringChar = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (trimmed === "" || trimmed.startsWith("#")) {
        continue;
      }

      // Track multiline strings
      const tripleQuotes = trimmed.match(/'''/g) || [];
      const tripleDoubleQuotes = trimmed.match(/"""/g) || [];

      if (tripleQuotes.length % 2 !== 0) {
        inMultilineString = !inMultilineString;
        multilineStringChar = "'''";
      }
      if (tripleDoubleQuotes.length % 2 !== 0) {
        inMultilineString = !inMultilineString;
        multilineStringChar = '"""';
      }

      if (inMultilineString) continue;

      // Check for missing colon after control statements
      const controlStatements = [
        /^if\s+.+[^:]$/,
        /^elif\s+.+[^:]$/,
        /^else[^:]$/,
        /^while\s+.+[^:]$/,
        /^for\s+.+[^:]$/,
        /^def\s+.+[^:]$/,
        /^class\s+.+[^:]$/,
        /^try[^:]$/,
        /^except.*[^:]$/,
        /^finally[^:]$/,
      ];

      for (const pattern of controlStatements) {
        if (pattern.test(trimmed) && !trimmed.endsWith(":")) {
          errors.push({
            line: lineNum,
            message: "Missing colon ':' at end of statement",
            type: "syntax",
          });
          break;
        }
      }

      // Check for common typos
      if (trimmed.includes("pritn(") || trimmed.includes("pirnt(")) {
        errors.push({
          line: lineNum,
          message: "Did you mean 'print'?",
          type: "typo",
        });
      }

      if (trimmed.includes("whlie ") || trimmed.includes("wihle ")) {
        errors.push({
          line: lineNum,
          message: "Did you mean 'while'?",
          type: "typo",
        });
      }

      if (trimmed.includes("ture") || trimmed.includes("Ture")) {
        warnings.push({
          line: lineNum,
          message: "Did you mean 'True'?",
          type: "typo",
        });
      }

      if (trimmed.includes("flase") || trimmed.includes("Flase")) {
        warnings.push({
          line: lineNum,
          message: "Did you mean 'False'?",
          type: "typo",
        });
      }

      // Check for unbalanced parentheses on single line
      const openParens = (line.match(/\(/g) || []).length;
      const closeParens = (line.match(/\)/g) || []).length;
      if (
        openParens !== closeParens &&
        !line.includes("'''") &&
        !line.includes('"""')
      ) {
        // This might be intentional multi-line, just warn
        if (Math.abs(openParens - closeParens) > 1) {
          warnings.push({
            line: lineNum,
            message: "Parentheses may be unbalanced",
            type: "syntax",
          });
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Confirm that any AIDriver instances only invoke supported methods. Reports
   * descriptive warnings when learners call undefined or disallowed helpers on
   * their robot controller objects.
   *
   * @param {string} code Python source to inspect.
   * @returns {Array<{line:number,message:string,type:string}>} Warning entries for each unsupported method.
   */
  function validateMethodUsage(code) {
    const warnings = [];
    const lines = code.split("\n");

    // First, find all variable names that are AIDriver instances
    const aiDriverVars = new Set();
    const aiDriverPattern = /(\w+)\s*=\s*AIDriver\s*\(/g;
    let varMatch;

    while ((varMatch = aiDriverPattern.exec(code)) !== null) {
      aiDriverVars.add(varMatch[1]);
    }

    console.log(
      "[Validator] Found AIDriver instances:",
      Array.from(aiDriverVars),
    );

    // Now check all method calls on AIDriver instances
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check each AIDriver variable for method calls
      for (const varName of aiDriverVars) {
        // Pattern to match varName.method()
        const methodPattern = new RegExp(`\\b${varName}\\.(\\w+)\\s*\\(`, "g");
        let methodMatch;

        while ((methodMatch = methodPattern.exec(line)) !== null) {
          const methodName = methodMatch[1];
          console.log(
            `[Validator] Line ${lineNum}: Found method call ${varName}.${methodName}()`,
          );

          if (!AIDRIVER_METHODS.has(methodName)) {
            console.log(`[Validator] INVALID method: ${methodName}`);
            warnings.push({
              line: lineNum,
              message: `'${methodName}' is not a valid AIDriver method. Valid methods: ${Array.from(
                AIDRIVER_METHODS,
              ).join(", ")}`,
              type: "method",
            });
          }
        }
      }
    }

    console.log("[Validator] Method warnings:", warnings);
    return warnings;
  }

  /**
   * Ensure all standalone function invocations resolve to approved builtins,
   * learner-defined functions, or previously assigned callables. Anything else
   * is reported as an undefined reference to guide the learner.
   *
   * @param {string} code Python program text.
   * @returns {Array<{line:number,message:string,type:string}>} Error list for unknown function calls.
   */
  function validateFunctionCalls(code) {
    const errors = [];
    const lines = code.split("\n");

    // Find all user-defined functions
    const userFunctions = new Set();
    const funcDefPattern = /^\s*def\s+(\w+)\s*\(/gm;
    let funcMatch;
    while ((funcMatch = funcDefPattern.exec(code)) !== null) {
      userFunctions.add(funcMatch[1]);
    }

    // Find all variable assignments (to allow calling them if they're callable)
    const variables = new Set();
    const varPattern = /^\s*(\w+)\s*=/gm;
    let varMatch;
    while ((varMatch = varPattern.exec(code)) !== null) {
      variables.add(varMatch[1]);
    }

    // Pattern to find standalone function calls (not method calls)
    // Matches: functionName( but not object.functionName(
    const standaloneFuncPattern = /(?<![.\w])(\w+)\s*\(/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comments and strings
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) continue;

      // Skip import lines and def lines
      if (trimmed.startsWith("import ") || trimmed.startsWith("from "))
        continue;
      if (trimmed.startsWith("def ")) continue;

      standaloneFuncPattern.lastIndex = 0;
      let match;

      while ((match = standaloneFuncPattern.exec(line)) !== null) {
        const funcName = match[1];

        // Skip if it's a valid function
        if (ALLOWED_FUNCTIONS.has(funcName)) continue;
        if (userFunctions.has(funcName)) continue;
        if (variables.has(funcName)) continue;

        // Skip Python keywords that look like function calls
        if (
          [
            "if",
            "while",
            "for",
            "elif",
            "except",
            "with",
            "assert",
            "lambda",
          ].includes(funcName)
        )
          continue;

        console.log(
          `[Validator] Line ${lineNum}: Unknown function call '${funcName}()'`,
        );
        errors.push({
          line: lineNum,
          message: `'${funcName}' is not defined. Did you forget to import it or define it?`,
          type: "undefined",
        });
      }
    }

    return errors;
  }

  /**
   * Map a Python interpreter error message onto a learner-friendly suggestion
   * hinting at likely fixes. Falls back to null when no known pattern matches.
   *
   * @param {string} errorMessage Raw error text raised during execution.
   * @returns {string|null} Suggested remediation guidance, when recognised.
   */
  function getSuggestion(errorMessage) {
    const suggestions = {
      SyntaxError: "Check for missing colons, parentheses, or quotation marks",
      NameError:
        "Make sure the variable is defined before use. Did you import AIDriver?",
      TypeError:
        "Check that you're using the correct number and types of arguments",
      AttributeError:
        "Check the spelling of the method name. Use help() to see available methods.",
      IndentationError:
        "Python uses spaces for indentation. Make sure your code is properly indented.",
    };

    for (const [error, suggestion] of Object.entries(suggestions)) {
      if (errorMessage.includes(error)) {
        return suggestion;
      }
    }

    return null;
  }

  // Public API
  return {
    validate,
    validateMethodUsage,
    validateFunctionCalls,
    getSuggestion,
    ALLOWED_IMPORTS,
    ALLOWED_FROM_AIDRIVER,
    AIDRIVER_METHODS,
  };
})();
