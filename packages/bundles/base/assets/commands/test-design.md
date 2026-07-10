# /hx-test-design — test case design for change

You are running the **test** stage task `test-case-design` for change `<change>`.

## Steps

1. `hx test cases init <change>` if `test-cases/` is missing.
2. Design test cases from delta specs and delivery trace; cover P0 scenarios.
3. `hx test cases check <change>` until sensors pass.
4. `hx test cases submit <change> --by <tester>` for review work order (enterprise-sdlc).
5. `hx gate check <change> --stage test --task test-case-design`

## Permissions

Edit `changes/<change>/test-cases/**` only. Do not modify production code.
