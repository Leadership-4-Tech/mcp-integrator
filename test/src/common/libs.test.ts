import { describe, it } from 'mocha'
import { expect } from 'chai'
import { openApiToZodSchema } from '../../../src/common/libs'
import { z } from 'zod'

describe('/src/common/libs.ts', () => {
  describe('#openApiToZodSchema()', () => {
    const buildSearchSchema = () => ({
      type: 'object',
      properties: {
        modelType: { type: 'string', description: 'The model type' },
        query: {
          type: 'object',
          description: 'Search query',
          // @ts-ignore
          properties: {
            take: { type: 'integer', description: 'Max records to return' },
            sort: {
              type: 'object',
              // @ts-ignore
              properties: {
                key: { type: 'string', description: 'Property key/column' },
                order: {
                  type: 'string',
                  enum: ['asc', 'dsc'],
                  description: 'Sort order (asc or dsc)',
                },
              },
              required: ['key', 'order'],
              description: 'Sorting statement',
            },
            page: {
              type: 'object',
              description: 'Pagination information (any shape)',
            },
            query: {
              type: 'array',
              description: 'Query tokens',
              // @ts-ignore
              items: {
                anyOf: [
                  {
                    type: 'string',
                    enum: ['AND', 'OR'],
                    description: 'Boolean query',
                  },
                  {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['property'],
                        description: 'property',
                      },
                      key: { type: 'string' },
                      value: {},
                      valueType: {
                        type: 'string',
                        enum: ['string', 'number', 'date', 'object', 'boolean'],
                      },
                      equalitySymbol: {
                        type: 'string',
                        enum: ['=', '<', '<=', '>', '>='],
                      },
                      options: {
                        type: 'object',
                        properties: {
                          caseSensitive: { type: 'boolean' },
                          startsWith: { type: 'boolean' },
                          endsWith: { type: 'boolean' },
                        },
                      },
                    },
                    required: [
                      'type',
                      'key',
                      'value',
                      'valueType',
                      'equalitySymbol',
                    ],
                  },
                  {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['datesAfter'],
                        description: 'datesAfter',
                      },
                      key: { type: 'string' },
                      date: { type: 'string', format: 'date-time' },
                      valueType: {
                        type: 'string',
                        enum: ['string', 'number', 'date', 'object', 'boolean'],
                      },
                      options: {
                        type: 'object',
                        properties: {
                          equalToAndAfter: { type: 'boolean' },
                        },
                      },
                    },
                    required: ['type', 'key', 'date', 'valueType'],
                  },
                  {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['datesBefore'],
                        description: 'datesBefore',
                      },
                      key: { type: 'string' },
                      date: { type: 'string', format: 'date-time' },
                      valueType: {
                        type: 'string',
                        enum: ['string', 'number', 'date', 'object', 'boolean'],
                      },
                      options: {
                        type: 'object',
                        properties: {
                          equalToAndBefore: { type: 'boolean' },
                        },
                      },
                    },
                    required: ['type', 'key', 'date', 'valueType'],
                  },
                ],
              },
            },
          },
        },
      },
      required: ['modelType', 'query'],
    })

    const makeSchema = () => {
      const fields = openApiToZodSchema(buildSearchSchema())
      return z.object(fields)
    }

    const makeValidPayload = () => ({
      modelType: 'user',
      query: {
        take: 25,
        sort: { key: 'createdAt', order: 'asc' },
        page: { cursor: 'abc', size: 25 },
        query: [
          'AND',
          {
            type: 'property',
            key: 'name',
            value: 'John',
            valueType: 'string',
            equalitySymbol: '=',
            options: { caseSensitive: false },
          },
          {
            type: 'datesAfter',
            key: 'createdAt',
            date: '2024-01-01T00:00:00.000Z',
            valueType: 'date',
            options: { equalToAndAfter: true },
          },
        ],
      },
    })

    it('accepts a valid payload', () => {
      const schema = makeSchema()
      const valid = schema.safeParse(makeValidPayload())
      expect(valid.success).to.equal(true)
    })

    it('enforces enum on sort.order', () => {
      const schema = makeSchema()
      const invalid = makeValidPayload()
      invalid.query.sort.order = 'ASC' as any
      expect(schema.safeParse(invalid).success).to.equal(false)
    })

    it('requires equalitySymbol in property token', () => {
      const schema = makeSchema()
      const invalid = makeValidPayload()
      invalid.query.query = [
        {
          type: 'property',
          key: 'name',
          value: 'John',
          valueType: 'string',
          // equalitySymbol missing
        },
      ] as any
      expect(schema.safeParse(invalid).success).to.equal(false)
    })

    it('rejects unknown token type in query array', () => {
      const schema = makeSchema()
      const invalid = makeValidPayload()
      invalid.query.query = [
        {
          type: 'unknown',
          key: 'name',
        },
      ] as any
      expect(schema.safeParse(invalid).success).to.equal(false)
    })
  })
})
