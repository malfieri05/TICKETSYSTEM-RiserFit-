import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HybridRetrievalService } from './hybrid-retrieval.service';
import { IngestionService } from './ingestion.service';
import { PrismaService } from '../../common/database/prisma.service';

describe('HybridRetrievalService.extractKeywords', () => {
  let service: HybridRetrievalService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HybridRetrievalService,
        { provide: PrismaService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: IngestionService, useValue: { embedOne: jest.fn() } },
      ],
    }).compile();

    service = module.get(HybridRetrievalService);
  });

  it('returns empty for empty input', () => {
    expect(service.extractKeywords('')).toEqual([]);
    expect(service.extractKeywords('   ')).toEqual([]);
  });

  it('drops stop words and tokens shorter than 3 chars', () => {
    const tokens = service.extractKeywords('how do I use the dashboard?');
    // "how", "do", "i", "the" dropped; "use" dropped as stop word.
    expect(tokens).toContain('dashboard');
    expect(tokens).not.toContain('how');
    expect(tokens).not.toContain('the');
  });

  it('keeps short single-token queries like "sla" or "rbac"', () => {
    expect(service.extractKeywords('sla')).toEqual(['sla']);
    expect(service.extractKeywords('rbac')).toEqual(['rbac']);
  });

  it('de-camelCases "LeaseIQ" → emits "lease", "iq", and phrase "lease iq"', () => {
    const tokens = service.extractKeywords('LeaseIQ');
    // Single token path: 2-char "iq" should still be allowed.
    expect(tokens).toContain('leaseiq');
    expect(tokens).toContain('lease');
    expect(tokens).toContain('iq');
    expect(tokens).toContain('lease iq');
  });

  it('handles multi-word query with a camelCase proper noun', () => {
    const tokens = service.extractKeywords('how do I use LeaseIQ');
    expect(tokens).toContain('leaseiq');
    expect(tokens).toContain('lease');
    // 2-char "iq" is dropped because we're past the single-token mode
    expect(tokens).not.toContain('iq');
    expect(tokens).toContain('lease iq');
  });

  it('caps the total number of tokens to 10', () => {
    const verbose =
      'aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll mmm nnn ooo';
    const tokens = service.extractKeywords(verbose);
    expect(tokens.length).toBeLessThanOrEqual(10);
  });

  it('dedupes tokens', () => {
    const tokens = service.extractKeywords('dispatch dispatch dispatch');
    expect(tokens.filter((t) => t === 'dispatch')).toHaveLength(1);
  });
});
