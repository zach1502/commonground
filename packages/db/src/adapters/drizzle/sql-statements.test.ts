import { describe, expect, it } from 'vitest';

import { sqlStatements } from './sql-statements.js';

describe('sqlStatements', () => {
  it('splits on semicolons and drops empty statements', () => {
    expect(sqlStatements('drop table a;\n\n drop table b ;;')).toEqual([
      'drop table a',
      'drop table b',
    ]);
  });

  it('keeps a semicolon inside a string, with a doubled quote before it', () => {
    expect(sqlStatements("insert into t values (';'), ('it''s; fine'); select 1")).toEqual([
      "insert into t values (';'), ('it''s; fine')",
      'select 1',
    ]);
  });

  it('keeps a backslash-escaped quote in an E string', () => {
    expect(sqlStatements("select E'a\\'; b'; select 2")).toEqual(["select E'a\\'; b'", 'select 2']);
  });

  it('keeps a semicolon inside a quoted identifier', () => {
    expect(sqlStatements('drop table "odd;name"; select 1')).toEqual([
      'drop table "odd;name"',
      'select 1',
    ]);
  });

  it('keeps a dollar-quoted body whole, tagged or not', () => {
    const plain = 'create function f() returns int as $$ begin return 1; end; $$ language plpgsql';
    const tagged = "do $body$ begin perform ';'; end $body$";
    expect(sqlStatements(`${plain};\n${tagged};`)).toEqual([plain, tagged]);
  });

  it('does not read a positional parameter or a dollar inside a name as a dollar quote', () => {
    expect(sqlStatements('select $1; select a$b$ from t; select 3')).toEqual([
      'select $1',
      'select a$b$ from t',
      'select 3',
    ]);
  });

  it('drops line and nested block comments, with their semicolons', () => {
    const text = '-- first; comment\ndrop table a; /* one; /* two; */ still; */ drop table b;';
    expect(sqlStatements(text)).toEqual(['drop table a', 'drop table b']);
  });

  it('keeps comment markers that sit inside a string', () => {
    expect(sqlStatements("select '-- not; a comment', '/* nor; this */'")).toEqual([
      "select '-- not; a comment', '/* nor; this */'",
    ]);
  });
});
