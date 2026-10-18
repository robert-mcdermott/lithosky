// SPDX-License-Identifier: Apache-2.0
// Playwright CLI callback against an isolated running app.
async page => {
  const check=(value,message)=>{if(!value)throw Error(message);};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1080});await page.reload();
  await page.waitForFunction(()=>!document.querySelector('#render-start').disabled);
  if(await page.getByRole('button',{name:'Keep this scene',exact:true}).isVisible())await page.getByRole('button',{name:'Keep this scene',exact:true}).click();
  await page.getByRole('combobox',{name:'Start with a scene',exact:true}).selectOption('alpine');
  await page.locator('#seed').fill('2026');await page.locator('#seed').press('Tab');
  await page.waitForFunction(()=>!document.querySelector('#render-start').disabled);
  await page.locator('#render-samples').selectOption('8');await page.locator('#render-start').click();
  await page.waitForFunction(()=>document.querySelector('#render-status').textContent.startsWith('Complete.'),{},{timeout:60000});
  const width=()=>page.locator('.workspace').evaluate(el=>el.getBoundingClientRect().width);
  const before=await width();
  await page.locator('.inspector').evaluate(el=>{el.scrollTop=400;});
  const scrollBefore=await page.locator('.inspector').evaluate(el=>el.scrollTop);
  await page.getByRole('button',{name:'Hide Scenes panel',exact:true}).click();
  check(await page.locator('#scenes-panel').isHidden(),'Scenes remained visible');
  const withoutScenes=await width();check(withoutScenes>before,'Scenes did not release workspace width');
  const controls=page.getByRole('button',{name:'Hide Controls panel',exact:true});
  await controls.focus();await page.keyboard.press('Space');
  check(await page.locator('#controls-panel').isHidden(),'Controls remained visible');
  check(await width()>withoutScenes,'Controls did not release workspace width');
  check(await page.locator('#toggle-controls').getAttribute('aria-expanded')==='false','Collapsed ARIA state');
  check(await page.locator('#controls-panel').evaluate(el=>el.contains(document.activeElement))===false,'Focus inside hidden panel');
  check(await page.locator('#export-image').isEnabled(),'Collapse invalidated finished render');
  await page.waitForFunction(()=>{
    const el=document.querySelector('#viewport'),canvas=el.querySelector('canvas'),bounds=el.getBoundingClientRect();
    const scale=Math.min(devicePixelRatio||1,1.5,1600/Math.max(bounds.width,1));
    return canvas.width===Math.max(1,Math.floor(bounds.width*scale));
  });
  await page.locator('.workspace').evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:'output/playwright/panels-collapsed.png'});
  await page.getByRole('button',{name:'Show Controls panel',exact:true}).press('Enter');
  check(await page.locator('.inspector').evaluate(el=>el.scrollTop)===scrollBefore,'Settings scroll position lost');
  check(await page.locator('#seed').inputValue()==='2026','Scene edit lost');
  await page.getByRole('button',{name:'Show Scenes panel',exact:true}).click();
  check(await width()===before,'Workspace width did not restore');
  check(await page.locator('#toggle-controls').getAttribute('aria-expanded')==='true','Expanded ARIA state');
  // Independent visibility survives breakpoint changes; compact layouts use the
  // existing scene picker and only expose the relevant control-panel toggle.
  await page.getByRole('button',{name:'Hide Controls panel',exact:true}).click();
  for(const w of [1728,1101,1024,851,850,601,600,390,320]) {
    await page.setViewportSize({width:w,height:844});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow with controls hidden at ${w}`);
    check(await page.locator('#toggle-controls').isVisible(),`Reopen button missing at ${w}`);
    await page.getByRole('button',{name:'Show Controls panel',exact:true}).click();
    check(await page.locator('#controls-panel').isVisible(),`Cannot reopen controls at ${w}`);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow with controls open at ${w}`);
    await page.getByRole('button',{name:'Hide Controls panel',exact:true}).click();
  }
  await page.screenshot({path:'output/playwright/panels-mobile.png'});
  await page.setViewportSize({width:1440,height:1080});
  await page.getByRole('button',{name:'Show Controls panel',exact:true}).click();
  check(await page.locator('#export-image').isEnabled(),'Resizing invalidated finished render');
  check(await page.locator('#seed').inputValue()==='2026','Resizing lost scene');
  check(errors.length===0,errors.join('; '));
  return {independent:true,widthReclaimed:true,scrollRestored:true,keyboard:true,sceneAndRenderPreserved:true,responsive:true,errors};
}
