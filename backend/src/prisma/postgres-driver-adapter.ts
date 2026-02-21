import postgres from 'postgres';

type PrismaQuery = {
  sql: string;
  args: unknown[];
};

type PrismaResultSet = {
  columnTypes: number[];
  columnNames: string[];
  rows: unknown[][];
  lastInsertId?: string;
};

type PrismaTransaction = {
  provider: 'postgres';
  adapterName: string;
  options: { usePhantomQuery: boolean };
  queryRaw(query: PrismaQuery): Promise<PrismaResultSet>;
  executeRaw(query: PrismaQuery): Promise<number>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
};

type PrismaDriverAdapter = {
  provider: 'postgres';
  adapterName: string;
  queryRaw(query: PrismaQuery): Promise<PrismaResultSet>;
  executeRaw(query: PrismaQuery): Promise<number>;
  executeScript(script: string): Promise<void>;
  startTransaction(isolationLevel?: string): Promise<PrismaTransaction>;
  getConnectionInfo?(): { supportsRelationJoins: boolean };
  dispose(): Promise<void>;
};

type PrismaDriverAdapterFactory = {
  provider: 'postgres';
  adapterName: string;
  connect(): Promise<PrismaDriverAdapter>;
};

type PostgresColumn = {
  name: string;
  type: number;
};

type PostgresResult = Array<Record<string, unknown>> & {
  columns?: PostgresColumn[];
  count?: number | bigint | null;
};

const ADAPTER_NAME = '@gapwalk/postgres-adapter';
const PG_PROVIDER = 'postgres' as const;

const COLUMN_TYPE = {
  Int32: 0,
  Int64: 1,
  Float: 2,
  Double: 3,
  Numeric: 4,
  Boolean: 5,
  Character: 6,
  Text: 7,
  Date: 8,
  Time: 9,
  DateTime: 10,
  Json: 11,
  Enum: 12,
  Bytes: 13,
  Uuid: 15,
  Int32Array: 64,
  Int64Array: 65,
  FloatArray: 66,
  DoubleArray: 67,
  NumericArray: 68,
  BooleanArray: 69,
  CharacterArray: 70,
  TextArray: 71,
  DateArray: 72,
  TimeArray: 73,
  DateTimeArray: 74,
  JsonArray: 75,
  EnumArray: 76,
  BytesArray: 77,
  UuidArray: 78,
} as const;

const PG_OID_TO_COLUMN_TYPE: Record<number, number> = {
  16: COLUMN_TYPE.Boolean,
  17: COLUMN_TYPE.Bytes,
  20: COLUMN_TYPE.Int64,
  21: COLUMN_TYPE.Int32,
  23: COLUMN_TYPE.Int32,
  25: COLUMN_TYPE.Text,
  114: COLUMN_TYPE.Json,
  700: COLUMN_TYPE.Float,
  701: COLUMN_TYPE.Double,
  1042: COLUMN_TYPE.Character,
  1043: COLUMN_TYPE.Text,
  1082: COLUMN_TYPE.Date,
  1083: COLUMN_TYPE.Time,
  1114: COLUMN_TYPE.DateTime,
  1184: COLUMN_TYPE.DateTime,
  1700: COLUMN_TYPE.Numeric,
  2950: COLUMN_TYPE.Uuid,
  3802: COLUMN_TYPE.Json,
  1000: COLUMN_TYPE.BooleanArray,
  1001: COLUMN_TYPE.BytesArray,
  1005: COLUMN_TYPE.Int32Array,
  1007: COLUMN_TYPE.Int32Array,
  1009: COLUMN_TYPE.TextArray,
  1014: COLUMN_TYPE.CharacterArray,
  1015: COLUMN_TYPE.TextArray,
  1016: COLUMN_TYPE.Int64Array,
  1021: COLUMN_TYPE.FloatArray,
  1022: COLUMN_TYPE.DoubleArray,
  1115: COLUMN_TYPE.DateTimeArray,
  1182: COLUMN_TYPE.DateArray,
  1183: COLUMN_TYPE.TimeArray,
  1185: COLUMN_TYPE.DateTimeArray,
  1231: COLUMN_TYPE.NumericArray,
  2951: COLUMN_TYPE.UuidArray,
  3807: COLUMN_TYPE.JsonArray,
};

function getArrayColumnTypeFromValue(value: unknown): number | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  let first: unknown = undefined;
  for (const item of value as unknown[]) {
    if (item !== null && item !== undefined) {
      first = item;
      break;
    }
  }
  if (typeof first === 'number') {
    return Number.isInteger(first)
      ? COLUMN_TYPE.Int32Array
      : COLUMN_TYPE.DoubleArray;
  }
  if (typeof first === 'boolean') {
    return COLUMN_TYPE.BooleanArray;
  }
  if (first instanceof Date) {
    return COLUMN_TYPE.DateTimeArray;
  }
  if (typeof first === 'string') {
    return COLUMN_TYPE.TextArray;
  }
  if (
    first instanceof Uint8Array ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(first))
  ) {
    return COLUMN_TYPE.BytesArray;
  }
  return COLUMN_TYPE.JsonArray;
}

function inferColumnType(oid: number | undefined, value: unknown): number {
  if (oid !== undefined) {
    const mapped = PG_OID_TO_COLUMN_TYPE[oid];
    if (mapped !== undefined) {
      return mapped;
    }
  }

  const inferredArrayType = getArrayColumnTypeFromValue(value);
  if (inferredArrayType !== undefined) {
    return inferredArrayType;
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? COLUMN_TYPE.Int32 : COLUMN_TYPE.Double;
  }
  if (typeof value === 'boolean') {
    return COLUMN_TYPE.Boolean;
  }
  if (typeof value === 'string') {
    return COLUMN_TYPE.Text;
  }
  if (value instanceof Date) {
    return COLUMN_TYPE.DateTime;
  }
  if (value && typeof value === 'object') {
    if (
      value instanceof Uint8Array ||
      (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
    ) {
      return COLUMN_TYPE.Bytes;
    }
    return COLUMN_TYPE.Json;
  }

  return COLUMN_TYPE.Text;
}

function normalizeResult(rawResult: PostgresResult): PrismaResultSet {
  const columns = rawResult.columns ?? [];
  const rows = rawResult as Array<Record<string, unknown>>;
  const columnNames =
    columns.length > 0
      ? columns.map((column) => column.name)
      : rows.length > 0
        ? Object.keys(rows[0] ?? {})
        : [];

  const columnTypes = columnNames.map((name, index) => {
    const oid = columns[index]?.type;
    const sampleValue = rows.find((row) => row?.[name] !== undefined)?.[name];
    return inferColumnType(oid, sampleValue);
  });

  const normalizedRows = rows.map((row) =>
    columnNames.map((columnName) => row[columnName]),
  );

  return {
    columnNames,
    columnTypes,
    rows: normalizedRows,
  };
}

function getAffectedRowCount(rawResult: PostgresResult): number {
  if (typeof rawResult.count === 'number') {
    return rawResult.count;
  }
  if (typeof rawResult.count === 'bigint') {
    return Number(rawResult.count);
  }
  return Array.isArray(rawResult) ? rawResult.length : 0;
}

function sanitizeIsolationLevel(isolationLevel?: string): string | undefined {
  if (!isolationLevel) {
    return undefined;
  }

  if (isolationLevel === 'SNAPSHOT') {
    return 'REPEATABLE READ';
  }

  const allowed = new Set([
    'READ UNCOMMITTED',
    'READ COMMITTED',
    'REPEATABLE READ',
    'SERIALIZABLE',
  ]);

  return allowed.has(isolationLevel) ? isolationLevel : undefined;
}

function createTransactionalAdapter(
  reservedSql: postgres.ReservedSql,
): PrismaTransaction {
  let closed = false;

  const queryRaw = async (query: PrismaQuery): Promise<PrismaResultSet> => {
    const rawResult = (await reservedSql.unsafe(
      query.sql,
      query.args as never[],
    )) as unknown as PostgresResult;

    return normalizeResult(rawResult);
  };

  const executeRaw = async (query: PrismaQuery): Promise<number> => {
    const rawResult = (await reservedSql.unsafe(
      query.sql,
      query.args as never[],
    )) as unknown as PostgresResult;

    return getAffectedRowCount(rawResult);
  };

  const releaseOnce = () => {
    if (!closed) {
      closed = true;
      reservedSql.release();
    }
  };

  return {
    provider: PG_PROVIDER,
    adapterName: ADAPTER_NAME,
    options: { usePhantomQuery: false },
    queryRaw,
    executeRaw,
    commit: async () => {
      if (closed) {
        return;
      }
      try {
        await reservedSql.unsafe('COMMIT');
      } finally {
        releaseOnce();
      }
    },
    rollback: async () => {
      if (closed) {
        return;
      }
      try {
        await reservedSql.unsafe('ROLLBACK');
      } finally {
        releaseOnce();
      }
    },
  };
}

export function createPostgresDriverAdapter(
  databaseUrl: string,
): PrismaDriverAdapterFactory {
  return {
    provider: PG_PROVIDER,
    adapterName: ADAPTER_NAME,
    connect: (): Promise<PrismaDriverAdapter> => {
      const sql = postgres(databaseUrl, {
        prepare: false,
        max: 10,
      });

      return Promise.resolve({
        provider: PG_PROVIDER,
        adapterName: ADAPTER_NAME,
        getConnectionInfo: () => ({ supportsRelationJoins: true }),
        queryRaw: async (query: PrismaQuery): Promise<PrismaResultSet> => {
          const rawResult = (await sql.unsafe(
            query.sql,
            query.args as never[],
          )) as unknown as PostgresResult;

          return normalizeResult(rawResult);
        },
        executeRaw: async (query: PrismaQuery): Promise<number> => {
          const rawResult = (await sql.unsafe(
            query.sql,
            query.args as never[],
          )) as unknown as PostgresResult;

          return getAffectedRowCount(rawResult);
        },
        executeScript: async (script: string): Promise<void> => {
          await sql.unsafe(script);
        },
        startTransaction: async (
          isolationLevel?: string,
        ): Promise<PrismaTransaction> => {
          const reservedSql = await sql.reserve();
          try {
            const normalizedIsolationLevel =
              sanitizeIsolationLevel(isolationLevel);
            if (normalizedIsolationLevel) {
              await reservedSql.unsafe(
                `BEGIN ISOLATION LEVEL ${normalizedIsolationLevel}`,
              );
            } else {
              await reservedSql.unsafe('BEGIN');
            }
          } catch (error) {
            reservedSql.release();
            throw error;
          }

          return createTransactionalAdapter(reservedSql);
        },
        dispose: async (): Promise<void> => {
          await sql.end({ timeout: 5 });
        },
      });
    },
  };
}
