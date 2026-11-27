# MCPView source used by the Code Mode beta

The beta uses the snippet catalog and layout modules from MCPView commit
`b0226b4452cc137fe03dc5950ef70514143c3530`. The TypeScript files here are
copied verbatim from the corresponding paths under `packages/` in MCPView.
The Compose archive in `src/ui/vendor/` comes from the same revision.

The import map and the Node build resolve these entry points locally so that
both beta runtimes can run before the framework packages are published.
Change those mappings back to the package exports when upgrading to a release
that contains this revision. Maintain the implementation and its tests in
MCPView.
