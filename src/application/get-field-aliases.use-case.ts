/**
 * Use case: return the field alias registry so callers can understand the
 * mapping between native feed field names and internal FeedItem field names.
 */
import { FIELD_ALIASES, type FieldAlias } from "../introspection/field-aliases.js";

export class GetFieldAliasesUseCase {
  execute(): FieldAlias[] {
    return FIELD_ALIASES;
  }
}
