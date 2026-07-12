import { TrendsController } from './trends.controller';
import { TrendsService } from './trends.service';

describe('TrendsController', () => {
  function make() {
    const trendsSince = jest.fn().mockResolvedValue([]);
    const controller = new TrendsController({
      trendsSince,
    } as unknown as TrendsService);
    return { controller, trendsSince };
  }

  it('defaults to 14 days when the param is absent or junk', async () => {
    const { controller, trendsSince } = make();
    await controller.find(undefined);
    await controller.find('not-a-number');
    await controller.find('-3');
    expect(trendsSince.mock.calls.map(([d]) => d)).toEqual([14, 14, 14]);
  });

  it('clamps the window to 90 days', async () => {
    const { controller, trendsSince } = make();
    await controller.find('365');
    expect(trendsSince).toHaveBeenCalledWith(90);
  });

  it('passes a sane window through', async () => {
    const { controller, trendsSince } = make();
    await controller.find('30');
    expect(trendsSince).toHaveBeenCalledWith(30);
  });
});
