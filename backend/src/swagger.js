const swaggerJsdoc = require('swagger-jsdoc');

const definition = {
  openapi: '3.1.0',
  info: {
    title: 'AI Library API',
    version: '1.0.0',
    description:
      '대학도서관 자동화시스템(LAS) REST API — 서지(MARC21) 및 전자자원(ERM) 관리',
  },
  servers: [
    { url: 'http://localhost:4000', description: '로컬 개발 서버' },
  ],
  tags: [
    { name: 'Bibs', description: '서지 레코드 (MARC21)' },
    { name: 'E-Resources', description: '전자자원' },
    { name: 'Usage Stats', description: '이용통계 / COUNTER R5' },
  ],
  components: {
    parameters: {
      PageParam: {
        in: 'query',
        name: 'page',
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
      LimitParam: {
        in: 'query',
        name: 'limit',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          details: { type: 'array', items: { type: 'object' } },
        },
      },
      Paginated: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          data: { type: 'array', items: {} },
        },
      },
      BibRecord: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          control_number: { type: 'string' },
          isbn: { type: ['string', 'null'] },
          call_number: { type: ['string', 'null'] },
          title: { type: 'string' },
          statement_of_resp: { type: ['string', 'null'] },
          main_entry: { type: ['string', 'null'] },
          publisher: { type: ['string', 'null'] },
          pub_year: { type: ['integer', 'null'] },
          extent: { type: ['string', 'null'] },
          abstract: { type: ['string', 'null'] },
          ddc_number: { type: ['string', 'null'] },
          electronic_url: { type: ['string', 'null'] },
          record_status: { type: 'string', enum: ['active', 'deleted'] },
        },
      },
      BibInput: {
        type: 'object',
        required: ['control_number', 'title'],
        properties: {
          control_number: { type: 'string' },
          isbn: { type: 'string' },
          call_number: { type: 'string' },
          title: { type: 'string' },
          statement_of_resp: { type: 'string' },
          main_entry: { type: 'string' },
          publisher: { type: 'string' },
          pub_year: { type: 'integer' },
          extent: { type: 'string' },
          abstract: { type: 'string' },
          ddc_number: { type: 'string' },
          electronic_url: { type: 'string' },
        },
      },
      EResource: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          title: { type: 'string' },
          resource_type: {
            type: 'string',
            enum: ['journal', 'ebook', 'database'],
          },
          provider: { type: ['string', 'null'] },
          platform_url: { type: ['string', 'null'] },
          issn: { type: ['string', 'null'] },
          isbn: { type: ['string', 'null'] },
          subject: { type: ['string', 'null'] },
          status: {
            type: 'string',
            enum: ['active', 'trial', 'cancelled'],
          },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      EResourceInput: {
        type: 'object',
        required: ['title', 'resource_type'],
        properties: {
          title: { type: 'string' },
          resource_type: {
            type: 'string',
            enum: ['journal', 'ebook', 'database'],
          },
          provider: { type: 'string' },
          platform_url: { type: 'string' },
          issn: { type: 'string' },
          isbn: { type: 'string' },
          subject: { type: 'string' },
          status: {
            type: 'string',
            enum: ['active', 'trial', 'cancelled'],
          },
        },
      },
    },
  },
  paths: {
    '/api/v1/bibs': {
      get: {
        tags: ['Bibs'],
        summary: '서지 레코드 목록 조회 (active)',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: '목록',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Paginated' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/BibRecord' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Bibs'],
        summary: '새 서지 레코드 등록',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BibInput' },
            },
          },
        },
        responses: {
          201: {
            description: '등록 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BibRecord' },
              },
            },
          },
          409: {
            description: '제어번호 중복',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/v1/bibs/search': {
      get: {
        tags: ['Bibs'],
        summary: '서지 레코드 검색 (title / main_entry / isbn 부분일치)',
        parameters: [
          {
            in: 'query',
            name: 'q',
            required: true,
            schema: { type: 'string' },
          },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: { 200: { description: '검색 결과' } },
      },
    },
    '/api/v1/bibs/{id}': {
      get: {
        tags: ['Bibs'],
        summary: '서지 레코드 상세 (MARC 필드 + 저자 + 주제)',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          200: { description: '상세' },
          404: { description: '서지 레코드 없음' },
        },
      },
      put: {
        tags: ['Bibs'],
        summary: '서지 레코드 부분 수정',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BibInput' },
            },
          },
        },
        responses: {
          200: { description: '수정 성공' },
          404: { description: '없음' },
        },
      },
      delete: {
        tags: ['Bibs'],
        summary: '서지 레코드 논리 삭제 (record_status=deleted)',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          200: { description: '삭제 성공' },
          404: { description: '없음' },
        },
      },
    },
    '/api/v1/e-resources': {
      get: {
        tags: ['E-Resources'],
        summary: '전자자원 목록 (필터: type, status)',
        parameters: [
          {
            in: 'query',
            name: 'type',
            schema: {
              type: 'string',
              enum: ['journal', 'ebook', 'database'],
            },
          },
          {
            in: 'query',
            name: 'status',
            schema: {
              type: 'string',
              enum: ['active', 'trial', 'cancelled'],
            },
          },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: '목록',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Paginated' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/EResource' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['E-Resources'],
        summary: '전자자원 등록',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/EResourceInput' },
            },
          },
        },
        responses: {
          201: {
            description: '등록 성공',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EResource' },
              },
            },
          },
        },
      },
    },
    '/api/v1/e-resources/{id}': {
      get: {
        tags: ['E-Resources'],
        summary: '전자자원 상세 (라이선스 포함)',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          200: { description: '상세' },
          404: { description: '전자자원 없음' },
        },
      },
      put: {
        tags: ['E-Resources'],
        summary: '전자자원 부분 수정',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/EResourceInput' },
            },
          },
        },
        responses: {
          200: { description: '수정 성공' },
          404: { description: '없음' },
        },
      },
    },
    '/api/v1/e-resources/{id}/stats': {
      get: {
        tags: ['Usage Stats'],
        summary: '특정 전자자원의 이용통계',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' },
          },
          {
            in: 'query',
            name: 'year',
            schema: { type: 'integer', minimum: 1900, maximum: 2100 },
          },
          {
            in: 'query',
            name: 'report_type',
            schema: { type: 'string', enum: ['TR', 'PR', 'DR', 'IR'] },
          },
        ],
        responses: {
          200: { description: '이용통계' },
          404: { description: '전자자원 없음' },
        },
      },
    },
    '/api/v1/e-resources/stats/cost-per-use': {
      get: {
        tags: ['Usage Stats'],
        summary: '전체 자원 Cost Per Use 계산',
        parameters: [
          {
            in: 'query',
            name: 'year',
            required: true,
            schema: { type: 'integer', minimum: 1900, maximum: 2100 },
          },
        ],
        responses: { 200: { description: '연도별 CPU' } },
      },
    },
    '/api/v1/e-resources/sushi/harvest': {
      get: {
        tags: ['Usage Stats'],
        summary: 'SUSHI 모의 수확 (COUNTER R5 Title Master Report, DB 기반)',
        parameters: [
          {
            in: 'query',
            name: 'e_resource_id',
            schema: { type: 'integer', minimum: 1 },
          },
          {
            in: 'query',
            name: 'begin_date',
            required: true,
            schema: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
            example: '2024-04',
          },
          {
            in: 'query',
            name: 'end_date',
            required: true,
            schema: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
            example: '2024-06',
          },
        ],
        responses: { 200: { description: 'COUNTER R5 JSON 응답' } },
      },
    },
  },
};

module.exports = swaggerJsdoc({ definition, apis: [] });
