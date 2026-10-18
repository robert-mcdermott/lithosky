// SPDX-License-Identifier: Apache-2.0
// Playwright CLI run-code callback. Open the generated site first.
async (page) => {
  const origin=new URL(page.url()).origin, failures=[];
  page.on('pageerror',error=>failures.push(error.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))failures.push(m.text());});
  const reports=[];
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    for(const route of ['index.html','install.html','guide.html','gallery.html']) {
      await page.goto(origin+'/'+route);
      // Bring lazy images into view before checking their decoded dimensions.
      for(const img of await page.locator('img').all()) await img.scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));
      const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,h1:document.querySelectorAll('h1').length,external:performance.getEntriesByType('resource').filter(r=>new URL(r.name).origin!==location.origin).map(r=>r.name)}));
      if(state.overflow||state.h1!==1||state.external.length)throw new Error(route+': '+JSON.stringify(state));
      reports.push({route,width,images:await page.locator('img').count()});
      if(width===390&&route==='index.html')await page.screenshot({path:'/tmp/lithosky-site-mobile.png',fullPage:true});
    }
  }
  const pending=page.waitForEvent('download');await page.getByRole('link',{name:'Open this starting point ↗',exact:true}).first().click();
  const download=await pending;await download.saveAs('/tmp/lithosky-site-alpine.lithosky');
  await page.getByRole('link',{name:'The field guide',exact:true}).click();
  await page.getByRole('link',{name:'Move the camera',exact:true}).click();
  if(!page.url().endsWith('#camera'))throw new Error('Camera tutorial anchor failed');
  await page.keyboard.press('Tab');
  if(await page.evaluate(()=>document.activeElement===document.body))throw new Error('Keyboard focus lost');
  if(failures.length)throw new Error(failures.join('; '));
  return {reports,download:download.suggestedFilename(),failures};
}
